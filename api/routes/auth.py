"""
Auth-related endpoints — bridges Supabase UUID to internal user IDs.
Uses a Redis hash for persistent, deterministic mapping.
"""
import logging
from fastapi import APIRouter
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel
from core.redis_client import get_redis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

MAPPING_HASH = "app:user:supabase_mapping"


class ProfileRequest(BaseModel):
    supabase_uid: str
    email: str = ""


@router.post("/profile", response_class=ORJSONResponse)
async def get_or_create_profile(req: ProfileRequest):
    """
    Maps a Supabase UUID to a deterministic internal user ID (1–330,975).
    If the user has been seen before, returns the same ID.
    If new, generates one via hash and stores it permanently.
    """
    r = await get_redis()

    # Check if we already have a mapping for this Supabase user
    existing = await r.hget(MAPPING_HASH, req.supabase_uid)
    if existing:
        internal_id = int(existing)
        logger.debug(f"Returning existing mapping: {req.supabase_uid[:8]}... → {internal_id}")
        return {
            "internal_user_id": internal_id,
            "is_new_user": False,
            "email": req.email,
            "display_name": req.email.split("@")[0] if req.email else "User",
        }

    # Generate a deterministic ID from the UUID
    internal_id = _hash_uuid(req.supabase_uid)

    # Store the mapping permanently (no TTL)
    await r.hset(MAPPING_HASH, req.supabase_uid, str(internal_id))
    logger.info(f"New user mapping created: {req.supabase_uid[:8]}... → {internal_id}")

    return {
        "internal_user_id": internal_id,
        "is_new_user": True,
        "email": req.email,
        "display_name": req.email.split("@")[0] if req.email else "User",
    }


def _hash_uuid(uuid: str) -> int:
    """Deterministic hash of a UUID string into the 1–330,975 range."""
    h = 0
    for ch in uuid:
        h = ((h << 5) - h) + ord(ch)
        h &= 0xFFFFFFFF  # Keep as 32-bit
    return (h % 330975) + 1
