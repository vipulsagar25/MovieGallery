"""
Production observability endpoints — cache metrics, queue health, system info.
"""
import time
from fastapi import APIRouter
from fastapi.responses import ORJSONResponse
from core.redis_client import CacheMetrics, get_redis
from core.metadata import _movie_db
from core.queue import QUEUE_MAIN, QUEUE_PROC, QUEUE_DLQ, SET_DEDUP, HASH_RETRIES

router = APIRouter(prefix="/stats", tags=["observability"])

_api_start_time = time.time()


@router.get("/cache", response_class=ORJSONResponse)
async def cache_stats():
    """Redis cache hit/miss stats — critical for tuning TTL and worker throughput."""
    return await CacheMetrics.stats()


@router.get("/queue", response_class=ORJSONResponse)
async def queue_stats():
    """Full Redis queue health — main, processing, DLQ, and dedup sizes."""
    try:
        r = await get_redis()
        pipe = r.pipeline()
        pipe.llen(QUEUE_MAIN)
        pipe.llen(QUEUE_PROC)
        pipe.llen(QUEUE_DLQ)
        pipe.scard(SET_DEDUP)
        pipe.hlen(HASH_RETRIES)
        results = await pipe.execute()

        return {
            "main_queue_pending": results[0],
            "currently_processing": results[1],
            "dead_letter_queue": results[2],
            "dedup_set_size": results[3],
            "users_with_retries": results[4],
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/system", response_class=ORJSONResponse)
async def system_stats():
    """API server uptime and memory usage."""
    import os, psutil
    uptime = int(time.time() - _api_start_time)
    try:
        proc = psutil.Process(os.getpid())
        mem_mb = proc.memory_info().rss / 1024 / 1024
    except Exception:
        mem_mb = -1

    return {
        "uptime_seconds": uptime,
        "memory_usage_mb": round(mem_mb, 1),
        "pid": os.getpid(),
    }


@router.delete("/cache/reset", response_class=ORJSONResponse)
async def reset_cache_stats():
    """Reset hit/miss counters — useful after a deployment or tuning session."""
    await CacheMetrics.reset()
    return {"status": "ok", "message": "Cache metrics reset"}


@router.get("/dashboard", response_class=ORJSONResponse)
async def dashboard_stats():
    """
    Aggregated dashboard endpoint — returns all system metrics in one call.
    Used by the frontend Analytics page for real-time monitoring.
    """
    import os, psutil

    uptime = int(time.time() - _api_start_time)

    # System metrics
    try:
        proc = psutil.Process(os.getpid())
        mem_mb = round(proc.memory_info().rss / 1024 / 1024, 1)
        cpu_pct = proc.cpu_percent(interval=None)
    except Exception:
        mem_mb = -1
        cpu_pct = -1

    # Cache metrics
    cache = await CacheMetrics.stats()

    # Queue metrics
    queue = {}
    try:
        r = await get_redis()
        pipe = r.pipeline()
        pipe.llen(QUEUE_MAIN)
        pipe.llen(QUEUE_PROC)
        pipe.llen(QUEUE_DLQ)
        pipe.scard(SET_DEDUP)
        results = await pipe.execute()
        queue = {
            "pending": results[0],
            "processing": results[1],
            "dlq": results[2],
            "dedup": results[3],
        }
    except Exception:
        pass

    # Rating metrics
    ratings = {}
    try:
        r = await get_redis()
        total_ratings = await r.get("app:ratings:total_count") or "0"
        recent_log = await r.lrange("app:ratings:log", 0, 9)

        # Parse recent activity
        recent_activity = []
        for entry in recent_log:
            parts = entry.split(":")
            if len(parts) >= 4:
                recent_activity.append({
                    "timestamp": int(parts[0]),
                    "user_id": int(parts[1]),
                    "movie_id": int(parts[2]),
                    "rating": parts[3],
                })

        ratings = {
            "total": int(total_ratings),
            "recent": recent_activity,
        }
    except Exception:
        pass

    # Redis health
    redis_ok = False
    try:
        r = await get_redis()
        redis_ok = await r.ping()
    except Exception:
        pass

    # Data Information
    total_new_users = 0
    try:
        r = await get_redis()
        total_new_users = await r.hlen("app:user:supabase_mapping")
    except Exception:
        pass

    data_info = {
        "total_movies": len(_movie_db),
        "total_users": 330975 + total_new_users,
        "new_users": total_new_users,
    }

    return {
        "timestamp": int(time.time()),
        "uptime_seconds": uptime,
        "memory_mb": mem_mb,
        "cpu_percent": cpu_pct,
        "redis_ok": redis_ok,
        "cache": cache,
        "queue": queue,
        "ratings": ratings,
        "data_info": data_info,
    }

