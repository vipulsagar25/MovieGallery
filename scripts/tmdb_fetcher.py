import os
import csv
import json
import asyncio
import aiohttp
import logging
from pathlib import Path

# Load ENV Variables (requires: pip install python-dotenv aiohttp)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

TMDB_READ_TOKEN = os.getenv("TMDB_READ_TOKEN", "")
TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")

DATA_DIR = Path(__file__).parent.parent / "Data"
LINKS_FILE = DATA_DIR / "links.csv"
OUTPUT_FILE = DATA_DIR / "posters.csv"

# TMDB generally allows 40 requests per 10 seconds historically, 
# but gracefully handles bursts up to 50 req/sec. 
CONCURRENCY_LIMIT = 30  
MAX_RETRIES = 3


async def fetch_poster(session: aiohttp.ClientSession, movie_id: str, tmdb_id: str, sem: asyncio.Semaphore) -> dict:
    async with sem:
        url = f"https://api.themoviedb.org/3/movie/{tmdb_id}?api_key={TMDB_API_KEY}"
        for attempt in range(MAX_RETRIES):
            try:
                async with session.get(url, timeout=10) as response:
                    if response.status == 200:
                        data = await response.json()
                        poster_path = data.get("poster_path")
                        return {"movie_id": movie_id, "tmdb_id": tmdb_id, "poster_path": poster_path}
                    elif response.status == 429:
                        # Rate limited: Exponential backoff
                        retry_after = int(response.headers.get("Retry-After", 2))
                        await asyncio.sleep(retry_after)
                    elif response.status == 404:
                        return {"movie_id": movie_id, "tmdb_id": tmdb_id, "poster_path": None}
                    else:
                        break  # Unhandled status code
            except Exception as e:
                # Network hiccup handling
                await asyncio.sleep(2 ** attempt)
        
        return {"movie_id": movie_id, "tmdb_id": tmdb_id, "poster_path": None}


async def main():
    if not TMDB_API_KEY and not TMDB_READ_TOKEN:
        logger.error("🚨 CRITICAL: Missing TMDB API KEY in .env file!")
        return

    logger.info("🎬 Starting High-Speed TMDB Poster Extraction Pipeline")
    
    # 1. Read existing hydrated links (to avoid re-fetching 86,000 links every time)
    completed_ids = set()
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                completed_ids.add(row["movie_id"])
    else:
        # Initialize output file
        with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["movie_id", "tmdb_id", "poster_path"])

    # 2. Extract targets from links.csv
    targets = []
    with open(LINKS_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            m_id = row.get("movieId")
            t_id = row.get("tmdbId")
            
            if m_id and t_id and m_id not in completed_ids:
                targets.append((m_id, t_id))
    
    logger.info(f"🔍 Discovered {len(targets)} TMDB missing visual IDs...")

    # 3. Spin up concurrent Async HTTP Session
    sem = asyncio.Semaphore(CONCURRENCY_LIMIT)
    headers = {"Authorization": f"Bearer {TMDB_READ_TOKEN}"} if TMDB_READ_TOKEN else {}
    
    # Process in batches to write sequentially and avoid RAM overload
    BATCH_SIZE = 500
    
    async with aiohttp.ClientSession(headers=headers) as session:
        for i in range(0, len(targets), BATCH_SIZE):
            batch = targets[i:i+BATCH_SIZE]
            
            tasks = [fetch_poster(session, m_id, t_id, sem) for m_id, t_id in batch]
            results = await asyncio.gather(*tasks)
            
            # Save batch cleanly
            with open(OUTPUT_FILE, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                valid_count = 0
                for r in results:
                    writer.writerow([r["movie_id"], r["tmdb_id"], r["poster_path"] or ""])
                    if r["poster_path"]: valid_count += 1
            
            logger.info(f"✅ Processed Batch {i//BATCH_SIZE + 1} | Total so far: {i + len(batch)} | Posters Extracted: {valid_count}/{len(batch)}")

    logger.info("🏆 Extraction Complete! Your database is now visually hydrated.")
    logger.info("Next Step: We will hook the RAM caching engine / Mongo DB script directly to these endpoints!")

if __name__ == "__main__":
    asyncio.run(main())
