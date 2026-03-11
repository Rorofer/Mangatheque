from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import httpx
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Jikan API base URL
JIKAN_API_BASE = "https://api.jikan.moe/v4"

# Enums
class MediaType(str, Enum):
    ANIME = "anime"
    MANGA = "manga"

class LibraryStatus(str, Enum):
    WATCHED = "watched"
    WATCHLIST = "watchlist"

# Define Models
class LibraryItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    mal_id: int  # MyAnimeList ID from Jikan
    media_type: MediaType
    title: str
    title_english: Optional[str] = None
    image_url: Optional[str] = None
    synopsis: Optional[str] = None
    score: Optional[float] = None
    episodes: Optional[int] = None  # For anime
    chapters: Optional[int] = None  # For manga
    status: LibraryStatus
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class LibraryItemCreate(BaseModel):
    mal_id: int
    media_type: MediaType
    title: str
    title_english: Optional[str] = None
    image_url: Optional[str] = None
    synopsis: Optional[str] = None
    score: Optional[float] = None
    episodes: Optional[int] = None
    chapters: Optional[int] = None
    status: LibraryStatus

class LibraryItemUpdate(BaseModel):
    status: LibraryStatus

class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Routes
@api_router.get("/")
async def root():
    return {"message": "Anime & Manga Tracker API"}

# Search anime/manga via Jikan API
@api_router.get("/search/{media_type}")
async def search_media(media_type: MediaType, q: str, page: int = 1, limit: int = 15):
    """Search for anime or manga using Jikan API"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{JIKAN_API_BASE}/{media_type.value}",
                params={"q": q, "page": page, "limit": limit},
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            
            # Transform the response to a cleaner format
            results = []
            for item in data.get("data", []):
                results.append({
                    "mal_id": item.get("mal_id"),
                    "title": item.get("title"),
                    "title_english": item.get("title_english"),
                    "image_url": item.get("images", {}).get("jpg", {}).get("large_image_url") or item.get("images", {}).get("jpg", {}).get("image_url"),
                    "synopsis": item.get("synopsis"),
                    "score": item.get("score"),
                    "episodes": item.get("episodes"),
                    "chapters": item.get("chapters"),
                    "media_type": media_type.value,
                    "status": item.get("status"),
                    "aired": item.get("aired", {}).get("string") if media_type == MediaType.ANIME else None,
                    "published": item.get("published", {}).get("string") if media_type == MediaType.MANGA else None,
                })
            
            return {
                "data": results,
                "pagination": data.get("pagination", {})
            }
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Search request timed out")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Error from Jikan API")
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Library CRUD operations
@api_router.get("/library", response_model=List[LibraryItem])
async def get_library(status: Optional[LibraryStatus] = None, media_type: Optional[MediaType] = None):
    """Get all items from the library with optional filters"""
    query = {}
    if status:
        query["status"] = status.value
    if media_type:
        query["media_type"] = media_type.value
    
    items = await db.library.find(query).sort("updated_at", -1).to_list(1000)
    return [LibraryItem(**item) for item in items]

@api_router.post("/library", response_model=LibraryItem)
async def add_to_library(item: LibraryItemCreate):
    """Add an item to the library"""
    # Check if item already exists
    existing = await db.library.find_one({
        "mal_id": item.mal_id,
        "media_type": item.media_type
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Item already in library")
    
    library_item = LibraryItem(**item.dict())
    await db.library.insert_one(library_item.dict())
    return library_item

@api_router.put("/library/{item_id}", response_model=LibraryItem)
async def update_library_item(item_id: str, update: LibraryItemUpdate):
    """Update an item's status in the library"""
    result = await db.library.find_one_and_update(
        {"id": item_id},
        {"$set": {"status": update.status.value, "updated_at": datetime.utcnow()}},
        return_document=True
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Item not found")
    
    return LibraryItem(**result)

@api_router.delete("/library/{item_id}")
async def remove_from_library(item_id: str):
    """Remove an item from the library"""
    result = await db.library.delete_one({"id": item_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    
    return {"message": "Item removed from library"}

@api_router.get("/library/check/{mal_id}/{media_type}")
async def check_in_library(mal_id: int, media_type: MediaType):
    """Check if an item is already in the library"""
    item = await db.library.find_one({
        "mal_id": mal_id,
        "media_type": media_type.value
    })
    
    if item:
        return {"in_library": True, "item": LibraryItem(**item)}
    return {"in_library": False, "item": None}

# Status endpoints
@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
