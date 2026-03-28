import logging
from core.redis_client import get_redis

logger = logging.getLogger(__name__)

QUEUE_MAIN = "app:queue:compute:main"
QUEUE_PROC = "app:queue:compute:processing"
QUEUE_DLQ = "app:queue:compute:dlq"
SET_DEDUP = "app:queue:compute:dedup"
HASH_RETRIES = "app:queue:compute:retries"

MAX_RETRIES = 3

async def enqueue_compute_task(user_id: int):
    """Enqueue task safely using a deduplication set."""
    try:
        r = await get_redis()
        # 1. Deduplication (don't enqueue if already queued)
        if await r.sadd(SET_DEDUP, user_id):
            await r.lpush(QUEUE_MAIN, user_id)
            logger.info(f"Enqueued computation task for user {user_id}")
        else:
            logger.info(f"User {user_id} already in queue (deduped)")
    except Exception as e:
        logger.error(f"Failed to enqueue task for user {user_id}: {e}")

async def fetch_task(timeout: int = 5) -> int | None:
    """Fetch task using BRPOPLPUSH for reliable processing."""
    try:
        r = await get_redis()
        result = await r.brpoplpush(QUEUE_MAIN, QUEUE_PROC, timeout)
        if result:
            return int(result)
    except Exception as e:
        logger.error(f"Failed to dequeue task: {e}")
    return None

async def acknowledge_task(user_id: int):
    """Mark task as done: remove from PROCESSING, DEDUP, and clear retries."""
    try:
        r = await get_redis()
        pipe = r.pipeline()
        pipe.lrem(QUEUE_PROC, 1, user_id)
        pipe.srem(SET_DEDUP, user_id)
        pipe.hdel(HASH_RETRIES, str(user_id))
        await pipe.execute()
    except Exception as e:
        logger.error(f"Failed to acknowledge task for user {user_id}: {e}")

async def retry_task(user_id: int):
    """On failure, move back to MAIN queue to retry, or DLQ if limit reached."""
    try:
        r = await get_redis()
        user_str = str(user_id)
        
        # Increment retry count
        retries = await r.hincrby(HASH_RETRIES, user_str, 1)
        
        pipe = r.pipeline()
        pipe.lrem(QUEUE_PROC, 1, user_id)
        
        if retries > MAX_RETRIES:
            # Route to Dead Letter Queue
            pipe.rpush(QUEUE_DLQ, user_id)
            pipe.srem(SET_DEDUP, user_id)
            pipe.hdel(HASH_RETRIES, user_str)
            logger.error(f"🚨 Task for user {user_id} moved to DLQ after {MAX_RETRIES} retries")
        else:
            # Route back to MAIN queue
            pipe.rpush(QUEUE_MAIN, user_id)
            logger.warning(f"⚠️ Task for user {user_id} moved back to main. Retry {retries}/{MAX_RETRIES}")
            
        await pipe.execute()
    except Exception as e:
        logger.error(f"Failed to retry task for user {user_id}: {e}")

async def restore_orphaned_tasks():
    """Recover tasks stuck in the PROC queue if the worker previously crashed."""
    try:
        r = await get_redis()
        restored_count = 0
        while True:
            # Pop from PROC and push back to MAIN
            task = await r.rpoplpush(QUEUE_PROC, QUEUE_MAIN)
            if not task:
                break
            restored_count += 1
            logger.info(f"Restored orphaned task for user {task}")
        return restored_count
    except Exception as e:
        logger.error(f"Failed to restore orphaned tasks: {e}")
        return 0
