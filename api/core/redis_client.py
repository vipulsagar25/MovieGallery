"""
Production Redis client — connection pooling, lockless metrics, TTL strategy.
"""
import asyncio
import logging
import random
import re
import redis.asyncio as redis
from core.config import get_settings

logger = logging.getLogger(__name__)

# ── Global state ──
_redis_pools: dict[int, redis.Redis] = {}


# ── Cache metrics — lockless atomic counters for 10K+ RPS ──
class CacheMetrics:
    """
    Production cluster-safe tracking using Redis Atomic Increments.
    Essential for Uvicorn multi-worker setups where UI polling hits random workers.
    """
    @classmethod
    async def hit(cls):
        try:
            r = await get_redis()
            await r.incr("app:metrics:cache_hits")
        except: pass

    @classmethod
    async def miss(cls):
        try:
            r = await get_redis()
            await r.incr("app:metrics:cache_misses")
        except: pass

    @classmethod
    async def stats(cls) -> dict:
        try:
            r = await get_redis()
            hits = int(await r.get("app:metrics:cache_hits") or 0)
            misses = int(await r.get("app:metrics:cache_misses") or 0)
            total = hits + misses
            return {
                "hits": hits,
                "misses": misses,
                "total": total,
                "hit_rate": f"{(hits / total * 100):.1f}%" if total > 0 else "0%",
            }
        except:
            return {"hits": 0, "misses": 0, "total": 0, "hit_rate": "0%"}

    @classmethod
    async def reset(cls):
        try:
            r = await get_redis()
            await r.delete("app:metrics:cache_hits", "app:metrics:cache_misses")
        except: pass


# ── TTL strategy ──
class CacheTTL:
    """Different data types deserve different cache lifetimes."""
    TRENDING  = 60     # 1 min   — trending movies change fast
    USER_RECS = 300    # 5 min   — personalized recommendations
    STATIC    = 3600   # 1 hour  — metadata, movie details
    JITTER_MAX = 30    # ± jitter to prevent thundering herd on mass expiry


# ── Connection management ──

async def get_redis(db: int = 0) -> redis.Redis:
    """Get or create a pooled async Redis connection for a specific database."""
    global _redis_pools
    if db not in _redis_pools:
        settings = get_settings()
        # Ensure we inject the correct DB into the connection URL
        base_url = settings.redis_url.rstrip("/")
        # If url already has a DB index (e.g. redis://localhost:6379/0), strip it

        base_url = re.sub(r"/\d+$", "", base_url)
        db_url = f"{base_url}/{db}"

        _redis_pools[db] = redis.from_url(
            db_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=200,       # Production: higher pool ceiling
            socket_timeout=5,          # Hardened timeouts for 10K RPS
            socket_connect_timeout=5,
            retry_on_timeout=True,     # Auto-retry transient failures
        )
        logger.info(f"Redis connection pool initialized for DB {db}")
    return _redis_pools[db]


async def close_redis():
    """Gracefully close all Redis connection pools on server shutdown."""
    global _redis_pools
    for db, pool in _redis_pools.items():
        await pool.aclose()
        logger.info(f"Redis connection pool closed for DB {db}")
    _redis_pools.clear()


# ── Key design (namespaced + versioned) ──

def make_rec_key(user_id: int, version: str = "v1") -> str:
    """Namespaced Redis key. Versioning allows safe cache invalidation on model updates."""
    return f"app:rec:{version}:user:{user_id}"
