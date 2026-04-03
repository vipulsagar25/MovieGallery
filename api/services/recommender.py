"""
Production recommendation service — handles both old (rich) and new (minimal) Redis payload formats.
"""
import logging
import orjson
from core.redis_client import get_redis, make_rec_key, CacheMetrics
from core.queue import enqueue_compute_task
from core.metadata import hydrate_recommendations

logger = logging.getLogger(__name__)


async def get_recommendations(user_id: int):
    """
    Production-grade fetch with backward-compatible payload parsing.

    Redis can hold two payload formats:
      NEW (minimal, 10K RPS):  {"r": [ids], "h": [ids], "u": user_id}
      OLD (rich, pre-refactor): {"recommendations": [{...}], "history": [{...}], "cached": True}

    This service handles both transparently.
    """
    try:
        redis = await get_redis()
        key = make_rec_key(user_id)
        cached = await redis.get(key)

        if cached:
            await CacheMetrics.hit()
            payload = orjson.loads(cached)

            # ── Detect payload format ──
            if "r" in payload:
                # NEW minimal format → hydrate IDs into rich movie objects
                rec_ids  = payload.get("r", [])
                hist_ids = payload.get("h", [])
                return {
                    "user_id": payload.get("u", user_id),
                    "recommendations": hydrate_recommendations(rec_ids),
                    "history": hydrate_recommendations(hist_ids),
                    "cached": True,
                }
            else:
                # OLD rich format → data already fully hydrated, serve directly
                recs = payload.get("recommendations", [])
                hist = payload.get("history", [])

                # If elements are ints (old minimal without "r" key), hydrate them
                if recs and isinstance(recs[0], int):
                    recs = hydrate_recommendations(recs)
                if hist and isinstance(hist[0], int):
                    hist = hydrate_recommendations(hist)

                return {
                    "user_id": payload.get("user_id", user_id),
                    "recommendations": recs,
                    "history": hist,
                    "cached": True,
                }

    except Exception as e:
        logger.warning(f"Redis lookup failed for user {user_id}: {e}")

    # Cache miss → trigger background worker, return loading state
    await CacheMetrics.miss()
    await enqueue_compute_task(user_id)

    return {
        "user_id": user_id,
        "recommendations": [],
        "history": [],
        "cached": False,
        "message": "Generating your personalized recommendations...",
    }