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
from emergentintegrations.llm.chat import LlmChat, UserMessage
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# LLM Key for translation
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Jikan API base URL
JIKAN_API_BASE = "https://api.jikan.moe/v4"

# Translation cache to avoid re-translating
translation_cache = {}

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

# Get anime/manga relations (franchise)
@api_router.get("/relations/{media_type}/{mal_id}")
async def get_relations(media_type: MediaType, mal_id: int):
    """Get related anime/manga (sequels, prequels, spin-offs, etc.)"""
    try:
        async with httpx.AsyncClient() as http_client:
            # Get relations
            relations_response = await http_client.get(
                f"{JIKAN_API_BASE}/{media_type.value}/{mal_id}/relations",
                timeout=30.0
            )
            relations_response.raise_for_status()
            relations_data = relations_response.json()
            
            # Filter and format relations
            related_items = []
            relation_types_priority = ["Sequel", "Prequel", "Parent story", "Side story", "Summary", "Full story", "Spin-off", "Alternative version", "Alternative setting"]
            
            for relation in relations_data.get("data", []):
                relation_type = relation.get("relation", "")
                entries = relation.get("entry", [])
                
                for entry in entries:
                    # Only include anime/manga entries
                    entry_type = entry.get("type", "").lower()
                    if entry_type == media_type.value:
                        related_items.append({
                            "mal_id": entry.get("mal_id"),
                            "title": entry.get("name"),
                            "relation_type": relation_type,
                            "media_type": entry_type,
                        })
            
            # Sort by relation type priority
            def sort_key(item):
                try:
                    return relation_types_priority.index(item["relation_type"])
                except ValueError:
                    return len(relation_types_priority)
            
            related_items.sort(key=sort_key)
            
            # Get additional details for each related item (limited to first 10)
            detailed_items = []
            for item in related_items[:10]:
                try:
                    # Add delay to respect API rate limits
                    await asyncio.sleep(0.35)
                    detail_response = await http_client.get(
                        f"{JIKAN_API_BASE}/{media_type.value}/{item['mal_id']}",
                        timeout=15.0
                    )
                    if detail_response.status_code == 200:
                        detail_data = detail_response.json().get("data", {})
                        detailed_items.append({
                            "mal_id": item["mal_id"],
                            "title": detail_data.get("title", item["title"]),
                            "title_english": detail_data.get("title_english"),
                            "image_url": detail_data.get("images", {}).get("jpg", {}).get("large_image_url") or detail_data.get("images", {}).get("jpg", {}).get("image_url"),
                            "synopsis": detail_data.get("synopsis"),
                            "score": detail_data.get("score"),
                            "episodes": detail_data.get("episodes"),
                            "chapters": detail_data.get("chapters"),
                            "media_type": media_type.value,
                            "relation_type": item["relation_type"],
                            "status": detail_data.get("status"),
                        })
                except Exception as e:
                    logger.warning(f"Failed to get details for {item['mal_id']}: {e}")
                    detailed_items.append({
                        **item,
                        "title_english": None,
                        "image_url": None,
                        "synopsis": None,
                        "score": None,
                        "episodes": None,
                        "chapters": None,
                        "status": None,
                    })
            
            return {"data": detailed_items}
            
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Request timed out")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Error from Jikan API")
    except Exception as e:
        logger.error(f"Relations error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

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

# Translation Models
class TranslationRequest(BaseModel):
    title: str
    synopsis: Optional[str] = None
    mal_id: int

class TranslationResponse(BaseModel):
    title_fr: str
    synopsis_fr: Optional[str] = None

class BatchTranslationRequest(BaseModel):
    items: List[TranslationRequest]

class BatchTranslationResponse(BaseModel):
    translations: dict  # mal_id -> TranslationResponse

@api_router.post("/translate/batch", response_model=BatchTranslationResponse)
async def translate_batch(request: BatchTranslationRequest):
    """Translate multiple anime/manga titles to French in batch"""
    translations = {}
    items_to_translate = []
    
    # Check cache first for all items
    for item in request.items:
        cache_key = f"{item.mal_id}"
        
        # Check memory cache
        if cache_key in translation_cache:
            translations[str(item.mal_id)] = translation_cache[cache_key]
            continue
        
        # Check database cache
        cached = await db.translations.find_one({"mal_id": item.mal_id})
        if cached:
            result = TranslationResponse(
                title_fr=cached.get("title_fr", item.title),
                synopsis_fr=cached.get("synopsis_fr")
            )
            translation_cache[cache_key] = result
            translations[str(item.mal_id)] = result
            continue
        
        items_to_translate.append(item)
    
    # Translate remaining items in batch
    if items_to_translate and EMERGENT_LLM_KEY:
        try:
            # Build batch request for LLM
            titles_list = "\n".join([f"- ID {item.mal_id}: {item.title}" for item in items_to_translate])
            
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"batch-translate-{items_to_translate[0].mal_id}",
                system_message="""Tu es un traducteur spécialisé dans les anime et manga.
Traduis les titres en français de manière naturelle.
Pour les titres qui ont une traduction officielle française connue (comme "L'Attaque des Titans" pour "Shingeki no Kyojin"), utilise-la.
Pour les titres qui n'ont pas de traduction officielle (comme "Rascal Does Not Dream of Bunny Girl Senpai"), garde le titre anglais ou japonais original.
Réponds UNIQUEMENT au format JSON sans markdown: {"ID": "titre_traduit", ...}
Exemple: {"16498": "L'Attaque des Titans", "20": "Naruto", "37450": "Rascal Does Not Dream of Bunny Girl Senpai"}"""
            ).with_model("openai", "gpt-4o-mini")
            
            user_message = UserMessage(text=f"Traduis ces titres d'anime/manga:\n{titles_list}")
            response = await chat.send_message(user_message)
            
            # Parse response
            import json
            response_clean = response.strip()
            if response_clean.startswith("```"):
                response_clean = response_clean.split("```")[1]
                if response_clean.startswith("json"):
                    response_clean = response_clean[4:]
            response_clean = response_clean.strip()
            
            translated_titles = json.loads(response_clean)
            
            # Save translations
            for item in items_to_translate:
                mal_id_str = str(item.mal_id)
                title_fr = translated_titles.get(mal_id_str, item.title)
                
                result = TranslationResponse(title_fr=title_fr, synopsis_fr=None)
                
                # Save to database
                await db.translations.update_one(
                    {"mal_id": item.mal_id},
                    {"$set": {
                        "mal_id": item.mal_id,
                        "title_fr": title_fr,
                        "original_title": item.title
                    }},
                    upsert=True
                )
                
                # Save to memory cache
                translation_cache[mal_id_str] = result
                translations[mal_id_str] = result
                
        except Exception as e:
            logger.error(f"Batch translation error: {str(e)}")
            # Return original titles on error
            for item in items_to_translate:
                translations[str(item.mal_id)] = TranslationResponse(title_fr=item.title, synopsis_fr=None)
    else:
        # No LLM key, return original titles
        for item in items_to_translate:
            translations[str(item.mal_id)] = TranslationResponse(title_fr=item.title, synopsis_fr=None)
    
    return BatchTranslationResponse(translations=translations)

@api_router.post("/translate", response_model=TranslationResponse)
async def translate_content(request: TranslationRequest):
    """Translate anime/manga title and synopsis to French"""
    cache_key = f"{request.mal_id}"
    
    # Check cache first
    if cache_key in translation_cache:
        return translation_cache[cache_key]
    
    # Check database cache
    cached = await db.translations.find_one({"mal_id": request.mal_id})
    if cached:
        result = TranslationResponse(
            title_fr=cached.get("title_fr", request.title),
            synopsis_fr=cached.get("synopsis_fr")
        )
        translation_cache[cache_key] = result
        return result
    
    if not EMERGENT_LLM_KEY:
        return TranslationResponse(title_fr=request.title, synopsis_fr=request.synopsis)
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"translate-{request.mal_id}",
            system_message="""Tu es un traducteur spécialisé dans les anime et manga. 
Traduis le titre et le résumé en français de manière naturelle et fluide.
Pour les titres qui sont déjà connus en français (comme "L'Attaque des Titans"), utilise le titre français officiel.
Pour les titres qui n'ont pas de traduction officielle (comme "Rascal Does Not Dream of Bunny Girl Senpai"), garde le titre anglais original.
Réponds UNIQUEMENT au format JSON sans markdown: {"title_fr": "...", "synopsis_fr": "..."}"""
        ).with_model("openai", "gpt-4o-mini")
        
        content = f"Titre: {request.title}"
        if request.synopsis:
            # Limit synopsis to first 500 chars for efficiency
            synopsis_short = request.synopsis[:1000] if len(request.synopsis) > 1000 else request.synopsis
            content += f"\n\nRésumé: {synopsis_short}"
        
        user_message = UserMessage(text=content)
        response = await chat.send_message(user_message)
        
        # Parse JSON response
        import json
        # Clean response if it has markdown
        response_clean = response.strip()
        if response_clean.startswith("```"):
            response_clean = response_clean.split("```")[1]
            if response_clean.startswith("json"):
                response_clean = response_clean[4:]
        response_clean = response_clean.strip()
        
        translated = json.loads(response_clean)
        result = TranslationResponse(
            title_fr=translated.get("title_fr", request.title),
            synopsis_fr=translated.get("synopsis_fr", request.synopsis)
        )
        
        # Save to database cache
        await db.translations.update_one(
            {"mal_id": request.mal_id},
            {"$set": {
                "mal_id": request.mal_id,
                "title_fr": result.title_fr,
                "synopsis_fr": result.synopsis_fr,
                "original_title": request.title
            }},
            upsert=True
        )
        
        # Save to memory cache
        translation_cache[cache_key] = result
        
        return result
        
    except Exception as e:
        logger.error(f"Translation error: {str(e)}")
        return TranslationResponse(title_fr=request.title, synopsis_fr=request.synopsis)

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
