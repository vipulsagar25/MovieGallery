"""
Production-grade Redis queue with deduplication, DLQ, and Redis 7.x compatibility.
Uses BLMOVE (Redis 6.2+) with fallback to BRPOPLPUSH for older deployments.
"""
import logging
from core.redis_client import get_redis

logger = logging.getLogger(__name__)

QUEUE_MAIN = "app:queue:compute:main"
QUEUE_PROC = "app:queue:compute:processing"
QUEUE_DLQ  = "app:queue:compute:dlq"
SET_DEDUP  = "app:queue:compute:dedup"
HASH_RETRIES = "app:queue:compute:retries"

MAX_RETRIES = 3


async def enqueue_compute_task(user_id: int):
    """Enqueue task safely with deduplication — idempotent."""
    try:
        r = await get_redis()
        # sadd returns 1 if the element was newly added, 0 if it already existed
        if await r.sadd(SET_DEDUP, user_id):
            await r.lpush(QUEUE_MAIN, user_id)
            logger.info(f"Enqueued computation task for user {user_id}")
        else:
            logger.debug(f"User {user_id} already in queue — skipping (deduped)")
    except Exception as e:
        logger.error(f"Failed to enqueue task for user {user_id}: {e}")


async def fetch_task(timeout: int = 5) -> int | None:
    """
    Fetch task using BLMOVE for reliable at-least-once processing.
    BLMOVE is the Redis 6.2+ replacement for the deprecated BRPOPLPUSH.
    Falls back to BRPOPLPUSH for Redis < 6.2.
    """
    try:
        r = await get_redis()
        try:
            # Redis 6.2+ preferred path
            result = await r.blmove(QUEUE_MAIN, QUEUE_PROC, timeout, "RIGHT", "LEFT")
        except Exception:
            # Fallback for older Redis deployments
            result = await r.brpoplpush(QUEUE_MAIN, QUEUE_PROC, timeout)

        if result:
            return int(result)
    except Exception as e:
        logger.error(f"Failed to fetch task from queue: {e}")
    return None


async def acknowledge_task(user_id: int):
    """Mark task complete — remove from PROCESSING, DEDUP, and clear retry counter."""
    try:
        r = await get_redis()
        pipe = r.pipeline()
        pipe.lrem(QUEUE_PROC, 1, user_id)
        pipe.srem(SET_DEDUP, user_id)
        pipe.hdel(HASH_RETRIES, str(user_id))
        await pipe.execute()
        logger.debug(f"Task acknowledged for user {user_id}")
    except Exception as e:
        logger.error(f"Failed to acknowledge task for user {user_id}: {e}")


async def retry_task(user_id: int):
    """On failure, re-enqueue or move to Dead Letter Queue after MAX_RETRIES."""
    try:
        r = await get_redis()
        user_str = str(user_id)
        retries = await r.hincrby(HASH_RETRIES, user_str, 1)

        pipe = r.pipeline()
        pipe.lrem(QUEUE_PROC, 1, user_id)

        if retries > MAX_RETRIES:
            pipe.rpush(QUEUE_DLQ, user_id)
            pipe.srem(SET_DEDUP, user_id)
            pipe.hdel(HASH_RETRIES, user_str)
            logger.error(f"🚨 User {user_id} moved to DLQ after {MAX_RETRIES} retries")
        else:
            pipe.rpush(QUEUE_MAIN, user_id)
            logger.warning(f"⚠️  User {user_id} re-queued. Attempt {retries}/{MAX_RETRIES}")

        await pipe.execute()
    except Exception as e:
        logger.error(f"Failed to retry task for user {user_id}: {e}")


async def restore_orphaned_tasks() -> int:
    """
    Recovery: move tasks stuck in PROCESSING back to MAIN.
    Called on worker startup to recover from previous crash.
    """
    try:
        r = await get_redis()
        restored = 0
        while True:
            task = await r.rpoplpush(QUEUE_PROC, QUEUE_MAIN)
            if not task:
                break
            restored += 1
            logger.info(f"Restored orphaned task for user {task}")
        return restored
    except Exception as e:
        logger.error(f"Failed to restore orphaned tasks: {e}")
        return 0


async def get_queue_lengths() -> dict:
    """Utility for stats endpoint."""
    try:
        r = await get_redis()
        main, proc, dlq, dedup = await r.execute_command(
            "MULTI"
        ) or (0, 0, 0, 0)
        pipe = r.pipeline()
        pipe.llen(QUEUE_MAIN)
        pipe.llen(QUEUE_PROC)
        pipe.llen(QUEUE_DLQ)
        pipe.scard(SET_DEDUP)
        results = await pipe.execute()
        return {
            "main_queue": results[0],
            "processing": results[1],
            "dlq": results[2],
            "dedup_set": results[3],
        }
    except Exception as e:
        logger.error(f"Failed to get queue lengths: {e}")
        return {}
