import csv
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

MOVIES_FILE = Path(__file__).parent.parent.parent / "Data" / "movies.csv"
LINKS_FILE = Path(__file__).parent.parent.parent / "Data" / "links.csv"
_movie_db = {}

def load_movie_metadata():
    """Load the entire movies.csv into a Blazing Fast RAM Dictionary on server boot."""
    global _movie_db
    if _movie_db:
        return
        
    try:
        # Load IMDB links first into a temporary blazing-fast map
        links_db = {}
        try:
            with open(LINKS_FILE, mode='r', encoding='utf-8') as lf:
                lreader = csv.DictReader(lf)
                for lrow in lreader:
                    try:
                        links_db[int(lrow['movieId'])] = lrow['imdbId']
                    except ValueError:
                        continue
        except Exception as e:
            logger.warning(f"⚠️ Failed to load links.csv: {e}")

        with open(MOVIES_FILE, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    movie_id = int(row['movieId'])
                    
                    # E.g., Toy Story (1995) | Adventure|Animation|Children|Comedy|Fantasy
                    _movie_db[movie_id] = {
                        "title": row.get('title', "Unknown Movie"),
                        "genres": row.get('genres', "Unknown").split("|"),
                        "imdb_id": links_db.get(movie_id, "")
                    }
                except ValueError:
                    continue
                    
        # --- STAGE 3: Hydrate 86k TMDB Poster URLs ---
        posters_file = Path(__file__).parent.parent.parent / "Data" / "posters.csv"
        if posters_file.exists():
            with open(posters_file, mode="r", encoding="utf-8") as pf:
                reader = csv.DictReader(pf)
                for row in reader:
                    movie_id_str = row.get("movie_id")
                    path = row.get("poster_path")
                    if movie_id_str and path:
                        try:
                            mid = int(movie_id_str)
                            if mid in _movie_db:
                                _movie_db[mid]["poster_url"] = f"https://image.tmdb.org/t/p/w500{path}"
                        except ValueError:
                            pass

        print(f"🎬 Hydration complete: Loaded {len(_movie_db):,} movies into Memory Cache.")
    except Exception as e:
        logger.error(f"❌ Failed to load movie metadata from {MOVIES_FILE}: {e}")


def hydrate_recommendations(movie_ids: list[int]) -> list[dict]:
    """Convert a raw array of [318, 593] into beautiful JSON objects instantly."""
    hydrated = []
    for mid in movie_ids:
        # Fast dictionary lookup (O(1) time complexity)
        meta = _movie_db.get(mid, {"title": f"Movie ID #{mid}", "genres": [], "poster_url": None, "imdb_id": ""})
        hydrated.append({
            "movie_id": mid,
            "title": meta["title"],
            "genres": meta["genres"],
            "poster_url": meta.get("poster_url"),
            "imdb_id": meta.get("imdb_id", "")
        })
    return hydrated


import math

from typing import Optional

def get_explore_paginated(page: int = 1, limit: int = 24, genre: Optional[str] = None, seed: int = 42) -> dict:
    """Return an array of explore movies for the Generic Home page with pagination and filtering."""
    if not _movie_db:
        return {"movies": [], "total": 0, "page": page, "pages": 0}
        
    # High-speed RAM filtering
    if genre and genre.lower() != "all":
        search_genre = genre.lower()
        # Takes ~2ms to filter 86,000 items in native Python dictionary
        filtered_ids = [mid for mid, meta in _movie_db.items() 
                       if search_genre in [g.lower() for g in meta['genres']]]
    else:
        filtered_ids = list(_movie_db.keys())
        
    # By using a dynamically-assigned UI seed, we ensure pagination completely stabilizes 
    # (Page 2 always correctly follows Page 1) while organically completely randomizing!
    import random
    rng = random.Random(seed)  
    rng.shuffle(filtered_ids)
    
    total = len(filtered_ids)
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    
    selected_ids = filtered_ids[start_idx:end_idx]
    
    return {
        "movies": hydrate_recommendations(selected_ids),
        "total": total,
        "page": page,
        "pages": math.ceil(total / limit)
    }
