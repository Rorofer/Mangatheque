#!/usr/bin/env python3
"""
Backend API Test Suite for Anime & Manga Tracker
Tests all backend endpoints using the production URL
"""

import requests
import json
import sys
import time
from datetime import datetime

# Use the production URL from frontend environment
BASE_URL = "https://anime-vault-100.preview.emergentagent.com/api"

def test_api_connection():
    """Test basic API connection"""
    print("🔗 Testing API connection...")
    try:
        response = requests.get(f"{BASE_URL}/", timeout=10)
        if response.status_code == 200:
            print("✅ API connection successful")
            print(f"Response: {response.json()}")
            return True
        else:
            print(f"❌ API connection failed with status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ API connection error: {e}")
        return False

def test_search_anime():
    """Test anime search endpoint"""
    print("\n🔍 Testing anime search...")
    try:
        # Test with a popular anime
        params = {"q": "One Piece", "limit": 5}
        response = requests.get(f"{BASE_URL}/search/anime", params=params, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            if "data" in data and len(data["data"]) > 0:
                print("✅ Anime search working")
                print(f"Found {len(data['data'])} results")
                # Print first result details
                first_result = data["data"][0]
                print(f"First result: {first_result.get('title', 'No title')}")
                print(f"MAL ID: {first_result.get('mal_id', 'No ID')}")
                return True, data["data"][0]  # Return first result for library testing
            else:
                print("❌ Anime search returned empty results")
                return False, None
        else:
            print(f"❌ Anime search failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return False, None
    except Exception as e:
        print(f"❌ Anime search error: {e}")
        return False, None

def test_search_manga():
    """Test manga search endpoint"""
    print("\n📚 Testing manga search...")
    try:
        # Test with a popular manga
        params = {"q": "Naruto", "limit": 5}
        response = requests.get(f"{BASE_URL}/search/manga", params=params, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            if "data" in data and len(data["data"]) > 0:
                print("✅ Manga search working")
                print(f"Found {len(data['data'])} results")
                # Print first result details
                first_result = data["data"][0]
                print(f"First result: {first_result.get('title', 'No title')}")
                print(f"MAL ID: {first_result.get('mal_id', 'No ID')}")
                return True, data["data"][0]  # Return first result for library testing
            else:
                print("❌ Manga search returned empty results")
                return False, None
        else:
            print(f"❌ Manga search failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return False, None
    except Exception as e:
        print(f"❌ Manga search error: {e}")
        return False, None

def test_library_get_empty():
    """Test getting library when it's empty"""
    print("\n📖 Testing get library (empty)...")
    try:
        response = requests.get(f"{BASE_URL}/library", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Get library working")
            print(f"Current library has {len(data)} items")
            return True, data
        else:
            print(f"❌ Get library failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return False, []
    except Exception as e:
        print(f"❌ Get library error: {e}")
        return False, []

def test_library_add_item(search_result, media_type, status="watched"):
    """Test adding item to library"""
    print(f"\n➕ Testing add {media_type} to library...")
    try:
        # Prepare item data from search result
        item_data = {
            "mal_id": search_result["mal_id"],
            "media_type": media_type,
            "title": search_result["title"],
            "title_english": search_result.get("title_english"),
            "image_url": search_result.get("image_url"),
            "synopsis": search_result.get("synopsis"),
            "score": search_result.get("score"),
            "status": status
        }
        
        # Add media-specific fields
        if media_type == "anime":
            item_data["episodes"] = search_result.get("episodes")
        else:
            item_data["chapters"] = search_result.get("chapters")
        
        response = requests.post(f"{BASE_URL}/library", json=item_data, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Add to library working")
            print(f"Added item with ID: {data.get('id', 'No ID')}")
            return True, data
        elif response.status_code == 400:
            error_detail = response.json().get("detail", "Unknown error")
            if "already in library" in error_detail:
                print("⚠️ Item already in library (expected behavior)")
                return True, None  # This is actually correct behavior
            else:
                print(f"❌ Add to library failed: {error_detail}")
                return False, None
        else:
            print(f"❌ Add to library failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return False, None
    except Exception as e:
        print(f"❌ Add to library error: {e}")
        return False, None

def test_library_get_with_items():
    """Test getting library with items"""
    print("\n📚 Testing get library (with items)...")
    try:
        response = requests.get(f"{BASE_URL}/library", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Get library working")
            print(f"Library now has {len(data)} items")
            
            # Test with filters
            if len(data) > 0:
                print("\n📋 Testing library filters...")
                
                # Test status filter
                response_watched = requests.get(f"{BASE_URL}/library?status=watched", timeout=10)
                if response_watched.status_code == 200:
                    watched_items = response_watched.json()
                    print(f"✅ Status filter working: {len(watched_items)} watched items")
                
                # Test media_type filter
                response_anime = requests.get(f"{BASE_URL}/library?media_type=anime", timeout=10)
                if response_anime.status_code == 200:
                    anime_items = response_anime.json()
                    print(f"✅ Media type filter working: {len(anime_items)} anime items")
            
            return True, data
        else:
            print(f"❌ Get library failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return False, []
    except Exception as e:
        print(f"❌ Get library error: {e}")
        return False, []

def test_library_update_item(item_id):
    """Test updating item status"""
    print(f"\n✏️ Testing update library item {item_id[:8]}...")
    try:
        update_data = {"status": "watchlist"}
        
        response = requests.put(f"{BASE_URL}/library/{item_id}", json=update_data, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Update library item working")
            print(f"Updated status to: {data.get('status', 'No status')}")
            return True, data
        elif response.status_code == 404:
            print("❌ Update failed: Item not found")
            return False, None
        else:
            print(f"❌ Update library item failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return False, None
    except Exception as e:
        print(f"❌ Update library item error: {e}")
        return False, None

def test_library_check_item(mal_id, media_type):
    """Test checking if item exists in library"""
    print(f"\n🔍 Testing check item in library (MAL ID: {mal_id})...")
    try:
        response = requests.get(f"{BASE_URL}/library/check/{mal_id}/{media_type}", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Check item in library working")
            print(f"In library: {data.get('in_library', 'Unknown')}")
            return True, data
        else:
            print(f"❌ Check item failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return False, None
    except Exception as e:
        print(f"❌ Check item error: {e}")
        return False, None

def test_library_delete_item(item_id):
    """Test deleting item from library"""
    print(f"\n🗑️ Testing delete library item {item_id[:8]}...")
    try:
        response = requests.delete(f"{BASE_URL}/library/{item_id}", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Delete library item working")
            print(f"Message: {data.get('message', 'No message')}")
            return True
        elif response.status_code == 404:
            print("❌ Delete failed: Item not found")
            return False
        else:
            print(f"❌ Delete library item failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Delete library item error: {e}")
        return False

def test_edge_cases():
    """Test edge cases and error handling"""
    print("\n🧪 Testing edge cases...")
    
    # Test invalid search
    try:
        response = requests.get(f"{BASE_URL}/search/anime?q=", timeout=10)
        print(f"Empty search query: Status {response.status_code}")
    except Exception as e:
        print(f"Empty search error: {e}")
    
    # Test invalid library operations
    try:
        # Try to get non-existent item
        response = requests.get(f"{BASE_URL}/library/check/999999999/anime", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"Non-existent item check: {data.get('in_library', 'Unknown')}")
        
        # Try to delete non-existent item
        response = requests.delete(f"{BASE_URL}/library/non-existent-id", timeout=10)
        print(f"Delete non-existent item: Status {response.status_code}")
        
        # Try to update non-existent item
        response = requests.put(f"{BASE_URL}/library/non-existent-id", json={"status": "watched"}, timeout=10)
        print(f"Update non-existent item: Status {response.status_code}")
        
    except Exception as e:
        print(f"Edge case error: {e}")

def main():
    """Run all backend tests"""
    print("🚀 Starting Backend API Tests for Anime & Manga Tracker")
    print(f"Base URL: {BASE_URL}")
    print("=" * 60)
    
    # Track test results
    test_results = {
        "api_connection": False,
        "search_anime": False,
        "search_manga": False,
        "library_get": False,
        "library_add": False,
        "library_update": False,
        "library_delete": False,
        "library_check": False
    }
    
    # Test API connection first
    test_results["api_connection"] = test_api_connection()
    if not test_results["api_connection"]:
        print("\n❌ API connection failed. Cannot proceed with other tests.")
        return test_results
    
    # Test search endpoints
    anime_success, anime_result = test_search_anime()
    test_results["search_anime"] = anime_success
    
    manga_success, manga_result = test_search_manga()
    test_results["search_manga"] = manga_success
    
    # Test library operations
    library_success, initial_library = test_library_get_empty()
    test_results["library_get"] = library_success
    
    # Add items to library for testing (if search worked)
    added_items = []
    if anime_result:
        add_success, added_item = test_library_add_item(anime_result, "anime", "watched")
        test_results["library_add"] = add_success
        if added_item:
            added_items.append(added_item)
    
    if manga_result:
        add_success2, added_item2 = test_library_add_item(manga_result, "manga", "watchlist")
        if not test_results["library_add"]:  # Only update if previous didn't succeed
            test_results["library_add"] = add_success2
        if added_item2:
            added_items.append(added_item2)
    
    # Test library with items
    if added_items:
        test_library_get_with_items()
        
        # Test update, check, and delete with first added item
        first_item = added_items[0]
        update_success, _ = test_library_update_item(first_item["id"])
        test_results["library_update"] = update_success
        
        check_success, _ = test_library_check_item(first_item["mal_id"], first_item["media_type"])
        test_results["library_check"] = check_success
        
        delete_success = test_library_delete_item(first_item["id"])
        test_results["library_delete"] = delete_success
    
    # Test edge cases
    test_edge_cases()
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for success in test_results.values() if success)
    total = len(test_results)
    
    for test_name, success in test_results.items():
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{test_name.replace('_', ' ').title():.<30} {status}")
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All backend tests passed!")
    else:
        print("⚠️ Some tests failed. Check the details above.")
    
    return test_results

if __name__ == "__main__":
    results = main()
    # Exit with error code if any test failed
    if not all(results.values()):
        sys.exit(1)