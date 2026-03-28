import json
import logging
from core.redis_client import get_redis, make_rec_key, CacheMetrics
from core.queue import enqueue_compute_task

# 🎬 NEW IMPORT: Our insanely fast In-Memory Metadata Hydrator
from core.metadata import hydrate_recommendations

logger = logging.getLogger(__name__)


async def get_recommendations(user_id: int):
    """
    Read-only: fetch precomputed recommendations from Redis.
    Worker handles computation — API only serves.
    """
    try:
        redis = await get_redis()
        key = make_rec_key(user_id)

        cached = await redis.get(key)
        if cached:
            await CacheMetrics.hit()
            recs_dict = json.loads(cached)
            
            # ✨ HYDRATION: Convert the cached raw matrix IDs into rich Hollywood Movie objects instantly!
            rich_recs = hydrate_recommendations(recs_dict.get("recommendations", []))
            
            # 📜 HYDRATE HISTORY: Do the exact same thing for the 12 movies the user already watched
            rich_history = hydrate_recommendations(recs_dict.get("history", []))
            
            return {
                "user_id": user_id,
                "recommendations": rich_recs,
                "history": rich_history,
                "cached": True,
            }
    except Exception as e:
        logger.warning(f"Redis read failed for user {user_id}: {e}")

    # Fallback: no precomputed data available
    await CacheMetrics.miss()
    
    # 🚨 CRITICAL FIX: Tell the ML worker to create this profile!
    await enqueue_compute_task(user_id)
    
    return {
        "user_id": user_id,
        "recommendations": [],
        "history": [],
        "cached": False,
        "message": "Generating recommendations. Refresh in 1 second.",
    }