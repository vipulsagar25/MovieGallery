"""
Movie rating endpoints — stores user ratings in Redis and triggers recommendation re-computation.
This creates a feedback loop: rate → recompute → improved recommendations.
"""
import logging
import time
from fastapi import APIRouter, Path
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel
from core.redis_client import get_redis
from core.queue import enqueue_compute_task
from core.config import get_settings
from supabase import create_client, Client

settings = get_settings()
supabase: Client | None = None
if settings.supabase_url and settings.supabase_anon_key:
    try:
        supabase = create_client(settings.supabase_url, settings.supabase_anon_key)
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rate", tags=["ratings"])

RATINGS_HASH = "app:ratings:user:{user_id}"
RATINGS_COUNT_KEY = "app:ratings:total_count"
RATINGS_LOG_KEY = "app:ratings:log"   # Recent rating activity log


class RatingRequest(BaseModel):
    movie_id: int
    rating: str  # "up" or "down"


@router.post("/{user_id}", response_class=ORJSONResponse)
async def rate_movie(
    req: RatingRequest,
    user_id: int = Path(..., ge=1, le=330975),
):
    """
    Rate a movie as thumbs up or thumbs down.
    Stores the rating and triggers recommendation re-computation.
    """
    r = await get_redis()
    key = RATINGS_HASH.format(user_id=user_id)

    # Store the rating
    await r.hset(key, str(req.movie_id), req.rating)

    # Increment global rating counter
    await r.incr(RATINGS_COUNT_KEY)

    # Log the rating event (keep last 100 events for analytics)
    log_entry = f"{int(time.time())}:{user_id}:{req.movie_id}:{req.rating}"
    pipe = r.pipeline()
    pipe.lpush(RATINGS_LOG_KEY, log_entry)
    pipe.ltrim(RATINGS_LOG_KEY, 0, 99)
    await pipe.execute()

    # Save permanently to Supabase PostgreSQL if configured
    if supabase:
        try:
            supabase.table("ratings").upsert({
                "user_id": user_id,
                "movie_id": req.movie_id,
                "rating": req.rating
            }, on_conflict="user_id,movie_id").execute()
        except Exception as e:
            logger.error(f"Failed to permanently save rating to DB: {e}")

    # Trigger recommendation re-computation
    await enqueue_compute_task(user_id)

    logger.info(f"User {user_id} rated movie {req.movie_id} as '{req.rating}'")

    return {
        "status": "ok",
        "message": f"Movie {req.movie_id} rated '{req.rating}'. Recommendations will update shortly.",
    }


@router.get("/{user_id}", response_class=ORJSONResponse)
async def get_user_ratings(
    user_id: int = Path(..., ge=1, le=330975),
):
    """Get all ratings for a specific user."""
    r = await get_redis()
    key = RATINGS_HASH.format(user_id=user_id)
    ratings = await r.hgetall(key)

    # Convert string keys to int
    return {
        "user_id": user_id,
        "ratings": {int(k): v for k, v in ratings.items()},
        "count": len(ratings),
    }
