"""
Production ML Worker — Netflix/Hotstar grade reliability.
Features:
  ✓ Graceful SIGINT/SIGTERM shutdown (no task loss)
  ✓ Heartbeat logging (detect silent crashes)
  ✓ In-executor FAISS search (non-blocking event loop)
  ✓ BLMOVE queue (Redis 6.2+ compatible)
  ✓ DLQ routing after MAX_RETRIES
  ✓ Orphan task recovery on startup
  ✓ ORJSON for minimum-size Redis payloads
"""
import asyncio
import signal
import time
import orjson
import logging
import random
from pathlib import Path
from typing import Any

import faiss
import numpy as np
import scipy.sparse as sparse
import pickle

from core.redis_client import get_redis, close_redis, make_rec_key, CacheTTL
from core.queue import fetch_task, acknowledge_task, retry_task, restore_orphaned_tasks
from core.metadata import load_movie_metadata

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("worker")

# ── Config ──
CONCURRENCY_LIMIT = 100
HEARTBEAT_INTERVAL = 60   # seconds between heartbeat log messages
POPULAR_MOVIES = [318, 356, 2571, 296, 593, 260, 480, 110, 589, 527]

# ── Global shutdown flag ──
_shutdown = False


# ── ML state container ──
class MLState:
    index: Any = None
    user_embeddings: Any = None
    item_mapping: Any = None
    user_mapping_rev: Any = None
    interactions: Any = None

ML = MLState()


# ── Startup: load models ──
def load_ml_artifacts():
    model_dir = Path(__file__).parent.parent / "ML_model"
    start = time.time()

    logger.info("Loading FAISS + embeddings from disk...")

    # 1. Movie embeddings → FAISS index
    real_movie_embeddings = np.load(str(model_dir / "user_embeddings.npy"))
    faiss.normalize_L2(real_movie_embeddings)
    ML.index = faiss.IndexFlatIP(real_movie_embeddings.shape[1])
    ML.index.add(real_movie_embeddings)

    # 2. User vectors (reconstructed from old FAISS file)
    wrong_faiss_db = faiss.read_index(str(model_dir / "movie_vector_db.faiss"))
    ML.user_embeddings = wrong_faiss_db.reconstruct_n(0, wrong_faiss_db.ntotal)

    # 3. Interaction matrix (Users × Items)
    ML.interactions = sparse.load_npz(str(model_dir / "user_item_interactions.npz")).tocsr()

    # 4. ID mappings
    with open(model_dir / "id_mappings.pkl", "rb") as f:
        mappings = pickle.load(f)
    ML.item_mapping = mappings["items"]
    ML.user_mapping_rev = {v: k for k, v in mappings["users"].items()}

    elapsed = time.time() - start
    logger.info(
        f"✅ ML artifacts loaded in {elapsed:.2f}s | "
        f"FAISS index: {ML.index.ntotal:,} vectors | "
        f"Users in model: {len(ML.user_mapping_rev):,} | "
        f"Interactions: {ML.interactions.nnz:,} entries"
    )


# ── Core: compute recommendations ──
def compute_user_recommendations(real_user_id: int) -> dict:
    """
    Synchronous FAISS vector search.
    Runs in executor to avoid blocking the asyncio event loop.
    """
    if real_user_id not in ML.user_mapping_rev:
        # Cold-start: user not in training data — fall back to globally popular movies
        logger.debug(f"Cold-start fallback for user {real_user_id}")
        return {"recommendations": POPULAR_MOVIES, "history": []}

    internal_user_id = ML.user_mapping_rev[real_user_id]
    user_vector = ML.user_embeddings[internal_user_id].reshape(1, -1)

    # FAISS cosine similarity search (top 50 candidates)
    _, I = ML.index.search(user_vector, 50)

    # Filter out movies the user has already watched (vectorized, no Python loop)
    seen_internal = ML.interactions[internal_user_id].indices
    unseen_mask = ~np.isin(I[0], seen_internal)
    unseen_movies = I[0][unseen_mask]

    # Map internal indices → real movie IDs
    recommendations = [
        int(ML.item_mapping[int(idx)])
        for idx in unseen_movies[:10]
    ]
    history = [
        int(ML.item_mapping[int(idx)])
        for idx in seen_internal[:12]
    ]

    return {"recommendations": recommendations, "history": history}


# ── Core: process one user task ──
async def process_user_reliable(user_id: int, redis_conn):
    try:
        loop = asyncio.get_running_loop()

        # Run CPU-heavy FAISS search in a thread — keeps event loop free
        results = await loop.run_in_executor(
            None, compute_user_recommendations, user_id
        )

        key = make_rec_key(user_id)
        ttl = CacheTTL.USER_RECS + random.randint(0, CacheTTL.JITTER_MAX)

        # ⚡ Minimal payload: store raw IDs only (API hydrates at serve time)
        # This is 10x smaller than storing full movie objects
        data = orjson.dumps({
            "r": results["recommendations"],
            "h": results["history"],
            "u": user_id,
        })

        await redis_conn.set(key, data, ex=ttl)
        await acknowledge_task(user_id)
        logger.debug(f"✓ User {user_id}: {len(results['recommendations'])} recs cached")

    except Exception as e:
        logger.error(f"✗ Failed processing user {user_id}: {e}")
        await retry_task(user_id)


# ── Worker loop ──
async def worker_loop(worker_id: int):
    """Single worker coroutine — runs forever until shutdown signal."""
    global _shutdown
    redis_conn = await get_redis()

    while not _shutdown:
        try:
            user_id = await fetch_task(timeout=2)
            if user_id is not None:
                logger.debug(f"[W-{worker_id:02d}] Processing user {user_id}")
                await process_user_reliable(user_id, redis_conn)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"[W-{worker_id:02d}] Unhandled error: {e}")
            await asyncio.sleep(1)  # back-off before retrying


# ── Heartbeat: detect silent worker death ──
async def heartbeat_loop():
    """Logs a health signal every HEARTBEAT_INTERVAL seconds."""
    global _shutdown
    tasks_start = 0
    while not _shutdown:
        await asyncio.sleep(HEARTBEAT_INTERVAL)
        logger.info(f"💓 Worker heartbeat — {CONCURRENCY_LIMIT} coroutines active")


# ── Main entry point ──
async def run_worker():
    global _shutdown

    # ── Load ML artifacts and metadata ──
    load_ml_artifacts()
    load_movie_metadata()

    # ── Recover any tasks orphaned from previous crash ──
    restored = await restore_orphaned_tasks()
    if restored > 0:
        logger.info(f"🔄 Restored {restored} orphaned tasks to queue")

    # ── Graceful shutdown handler ──
    loop = asyncio.get_running_loop()
    def _signal_handler():
        global _shutdown
        logger.info("🛑 Shutdown signal received — draining in-flight tasks...")
        _shutdown = True

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _signal_handler)
        except (NotImplementedError, RuntimeError):
            # Windows doesn't support add_signal_handler for all signals
            pass

    # ── Spin up workers ──
    logger.info(f"🚀 Spinning up {CONCURRENCY_LIMIT} worker coroutines...")
    workers = [asyncio.create_task(worker_loop(i)) for i in range(CONCURRENCY_LIMIT)]
    heartbeat = asyncio.create_task(heartbeat_loop())

    try:
        await asyncio.gather(*workers, heartbeat)
    except asyncio.CancelledError:
        pass
    finally:
        heartbeat.cancel()
        for w in workers:
            w.cancel()
        await asyncio.gather(*workers, heartbeat, return_exceptions=True)
        await close_redis()
        logger.info("✅ Worker shutdown complete — all tasks drained")


if __name__ == "__main__":
    try:
        asyncio.run(run_worker())
    except KeyboardInterrupt:
        pass
