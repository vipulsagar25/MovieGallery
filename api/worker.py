"""
High-Throughput ML Worker — Thread-safe, bounded concurrency, vectorized filtering.
"""
import asyncio
import json
import logging
import random
from pathlib import Path

import faiss
import numpy as np
import scipy.sparse as sparse
import pickle

from core.redis_client import get_redis, close_redis, make_rec_key, CacheTTL
from core.queue import fetch_task, acknowledge_task, retry_task, restore_orphaned_tasks

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

CONCURRENCY_LIMIT = 50
POPULAR_MOVIES = [318, 356, 2571, 296, 593, 260, 480, 110, 589, 527]

from typing import Any

class MLState:
    index: Any = None
    user_embeddings: Any = None
    item_mapping: Any = None
    user_mapping_rev: Any = None
    interactions: Any = None

ML = MLState()

def load_ml_artifacts():
    print("📦 Loading FAISS Vector DB and Embeddings...")
    model_dir = Path(__file__).parent.parent / "ML_model"
    
    # --- HOTFIX: Force swap FAISS items via Memory Reconstruction ---
    # 1. Load Movie Vectors and rebuild FAISS correctly
    real_movie_embeddings = np.load(str(model_dir / "user_embeddings.npy"))
    faiss.normalize_L2(real_movie_embeddings)
    ML.index = faiss.IndexFlatIP(real_movie_embeddings.shape[1])
    ML.index.add(real_movie_embeddings)
    
    # 2. Extract Real User Vectors from old FAISS DB
    wrong_faiss_db = faiss.read_index(str(model_dir / "movie_vector_db.faiss"))
    ML.user_embeddings = wrong_faiss_db.reconstruct_n(0, wrong_faiss_db.ntotal)

    # 3. Load Interactions correctly as (Users x Items)
    ML.interactions = sparse.load_npz(str(model_dir / "user_item_interactions.npz")).tocsr()
    
    # 4. Load Mappings
    with open(model_dir / "id_mappings.pkl", "rb") as f:
        mappings = pickle.load(f)
    
    ML.item_mapping = mappings["items"]
    ML.user_mapping_rev = {v: k for k, v in mappings["users"].items()}
    print("✅ ML Artifacts loaded and swapped back dynamically.")


def compute_user_recommendations(real_user_id: int) -> dict:
    """Microsecond FAISS Vector Search with Vectorized Seen-Item Filtering"""
    if real_user_id not in ML.user_mapping_rev:
        return {"recommendations": POPULAR_MOVIES, "history": []}
        
    internal_user_id = ML.user_mapping_rev[real_user_id]
    user_vector = ML.user_embeddings[internal_user_id].reshape(1, -1)
    
    D, I = ML.index.search(user_vector, 50)
    
    seen_internal_items = ML.interactions[internal_user_id].indices
    unseen_mask = ~np.isin(I[0], seen_internal_items)
    unseen_internal_movies = I[0][unseen_mask]
    
    recommended_movies = []
    for internal_movie_idx in unseen_internal_movies[:10]:
        real_movie_id = ML.item_mapping[int(internal_movie_idx)]
        recommended_movies.append(int(real_movie_id))
        
    # Extract out a snapshot of what the user has previously watched!
    history_movies = []
    for internal_movie_idx in seen_internal_items[:12]:  # Grab up to 12 watched movies
        real_movie_id = ML.item_mapping[int(internal_movie_idx)]
        history_movies.append(int(real_movie_id))
            
    return {
        "recommendations": recommended_movies,
        "history": history_movies
    }


async def process_user_reliable(user_id: int, redis_conn):
    try:
        loop = asyncio.get_running_loop()
        results = await loop.run_in_executor(None, compute_user_recommendations, user_id)
        
        key = make_rec_key(user_id)
        ttl = CacheTTL.USER_RECS + random.randint(0, CacheTTL.JITTER_MAX)
        data = json.dumps({
            "user_id": user_id, 
            "recommendations": results["recommendations"],
            "history": results["history"]
        })
        
        await redis_conn.set(key, data, ex=ttl)
        logger.debug(f"✅ User {user_id} recommendations updated")
        
        await acknowledge_task(user_id)
        
    except Exception as e:
        logger.error(f"❌ Failed processing user {user_id}: {e}. Retrying...")
        await retry_task(user_id)


async def worker_loop(worker_id: int):
    redis_conn = await get_redis()
    try:
        while True:
            user_id = await fetch_task(timeout=2)
            if user_id is not None:
                logger.debug(f"[Worker-{worker_id}] 📥 Picked up task for user {user_id}")
                await process_user_reliable(user_id, redis_conn)
    except asyncio.CancelledError:
        pass


async def run_worker():
    load_ml_artifacts()
    restored = await restore_orphaned_tasks()
    if restored > 0:
        logger.info(f"   Restored {restored} tasks to main queue.")

    print(f"🎧 Spinning up {CONCURRENCY_LIMIT} strict worker threads...")
    workers = [asyncio.create_task(worker_loop(i)) for i in range(CONCURRENCY_LIMIT)]
    
    try:
        await asyncio.gather(*workers)
    except asyncio.CancelledError:
        print("\n🛑 Workers shutting down cleanly...")
    finally:
        await close_redis()

if __name__ == "__main__":
    try:
        asyncio.run(run_worker())
    except KeyboardInterrupt:
        pass
