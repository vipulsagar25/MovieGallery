from fastapi import APIRouter, Path, HTTPException
from services.recommender import get_recommendations
from models.schemas import RecommendationResponse
from core.queue import enqueue_compute_task
from typing import Optional

router = APIRouter(prefix="/recommend", tags=["recommend"])

@router.get("/explore")
async def explore_movies(page: int = 1, limit: int = 24, genre: Optional[str] = None, seed: int = 42):
    """Returns paginated and optionally filtered movies for the Explore tab."""
    from core.metadata import get_explore_paginated
    return get_explore_paginated(page=page, limit=limit, genre=genre, seed=seed)

@router.get("/{user_id}", response_model=RecommendationResponse)
async def recommend(
    user_id: int = Path(..., ge=1, le=330975, title="User ID", description="A valid internal User matrix ID between 1 and 330,975")
):
    result = await get_recommendations(user_id)
    return result

@router.post("/{user_id}/interact")
async def interact(
    user_id: int = Path(..., ge=1, le=330975, title="User ID", description="The active internal User ID")
):
    """
    Simulate user interaction (e.g. clicked an item or finished a session).
    This event triggers a recompute of their recommendations offline.
    """
    await enqueue_compute_task(user_id)
    return {"status": "success", "message": f"User {user_id} interaction recorded. Recommendations update queued."}