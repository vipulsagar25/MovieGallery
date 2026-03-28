from fastapi import APIRouter
from core.redis_client import CacheMetrics, get_redis
from core.queue import QUEUE_MAIN, QUEUE_PROC, QUEUE_DLQ, SET_DEDUP

router = APIRouter(prefix="/stats", tags=["observability"])


@router.get("/cache")
async def cache_stats():
    """Get cache hit/miss stats — essential for tuning."""
    return CacheMetrics.stats()


@router.get("/queue")
async def queue_stats():
    """Get Redis Queue and DLQ stats."""
    try:
        r = await get_redis()
        
        # Lists lengths
        main_len = await r.llen(QUEUE_MAIN)
        proc_len = await r.llen(QUEUE_PROC)
        dlq_len = await r.llen(QUEUE_DLQ)
        
        # Dedup set size
        dedup_len = await r.scard(SET_DEDUP)

        return {
            "main_queue_length": main_len,
            "processing_tasks": proc_len,
            "dlq_length": dlq_len,
            "active_dedup_locks": dedup_len
        }
    except Exception as e:
        return {"error": str(e)}
