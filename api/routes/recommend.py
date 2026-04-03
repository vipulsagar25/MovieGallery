from fastapi import APIRouter, Path, HTTPException, Response
from services.recommender import get_recommendations
from core.redis_client import get_redis, make_rec_key
from core.queue import enqueue_compute_task
from core.metadata import hydrate_recommendations
from typing import Optional

router = APIRouter(prefix="/recommend", tags=["recommend"])

@router.get("/popular")
async def popular_movies(limit: int = 20):
    """Returns globally popular movies — used for cold-start users with no watch history."""
    # These are the most-rated movies in the MovieLens dataset
    POPULAR_IDS = [
        318, 356, 296, 593, 2571, 260, 480, 110, 589, 527,
        2959, 1196, 2858, 50, 47, 1198, 4993, 5952, 7153, 58559,
    ]
    return {
        "movies": hydrate_recommendations(POPULAR_IDS[:limit]),
        "total": len(POPULAR_IDS[:limit]),
    }


@router.get("/explore")
async def explore_movies(page: int = 1, limit: int = 24, genre: Optional[str] = None, seed: int = 42):
    """Returns paginated and optionally filtered movies for the Explore tab."""
    from core.metadata import get_explore_paginated
    return get_explore_paginated(page=page, limit=limit, genre=genre, seed=seed)

@router.get("/{user_id}")
async def recommend(
    user_id: int = Path(..., ge=1, le=330975, title="User ID", description="A valid internal User matrix ID between 1 and 330,975")
):
    result = await get_recommendations(user_id)
    # ⚡ If the result is minimal (for 10K RPS), the client handles ID-only
    return result

@router.get("/bench/{user_id}")
async def bench(user_id: int):
    """
    ULTRA-TEST: This is the raw-speed path for the 10K RPS benchmark.
    Bypasses services and serialization entirely.
    """
    redis = await get_redis()
    key = make_rec_key(user_id)
    data = await redis.get(key)
    if data:
        return Response(content=data, media_type="application/json")
    return Response(status_code=404)

@router.post("/{user_id}/interact")
async def interact(
    user_id: int = Path(..., ge=1, le=330975, title="User ID", description="The active internal User ID")
):
    """
    Simulate user interaction (e.g. clicked an item or finished a session).
    This event triggers a recompute of their recommendations offline.
    """
    await enqueue_compute_task(user_id)
    return "ok"