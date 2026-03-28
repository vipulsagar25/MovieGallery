import json
import asyncio
import logging
import random
import uuid
import redis.asyncio as redis
from core.config import get_settings

logger = logging.getLogger(__name__)

# ── Global state ──
_redis_pool: redis.Redis | None = None


# ── Cache metrics (concurrency-safe) ──
class CacheMetrics:
    """Track cache performance. In production, use Prometheus counters (lock-free, atomic)."""
    hits: int = 0
    misses: int = 0
    _lock: asyncio.Lock | None = None

    @classmethod
    def _get_lock(cls) -> asyncio.Lock:
        if cls._lock is None:
            cls._lock = asyncio.Lock()
        return cls._lock

    @classmethod
    async def hit(cls):
        async with cls._get_lock():
            cls.hits += 1

    @classmethod
    async def miss(cls):
        async with cls._get_lock():
            cls.misses += 1

    @classmethod
    def stats(cls) -> dict:
        total = cls.hits + cls.misses
        return {
            "hits": cls.hits,
            "misses": cls.misses,
            "total": total,
            "hit_rate": f"{(cls.hits / total * 100):.1f}%" if total > 0 else "0%",
        }


# ── TTL strategy ──
class CacheTTL:
    """Different data types need different TTLs."""
    TRENDING = 60          # 1 min
    USER_RECS = 300        # 5 min
    STATIC = 3600          # 1 hour
    JITTER_MAX = 30        # random jitter range (seconds)


# ── Connection management ──

async def get_redis() -> redis.Redis:
    """Get or create async Redis connection with optimized settings."""
    global _redis_pool
    if _redis_pool is None:
        settings = get_settings()
        _redis_pool = redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=100,
            socket_timeout=5,
            socket_connect_timeout=5,
        )
    return _redis_pool


async def close_redis():
    """Close Redis connection on shutdown."""
    global _redis_pool
    if _redis_pool is not None:
        await _redis_pool.aclose()
        _redis_pool = None


# ── Key design (namespaced + versioned) ──

def make_rec_key(user_id: int, version: str = "v1") -> str:
    """Standardized key: app:rec:{version}:user:{id}"""
    return f"app:rec:{version}:user:{user_id}"


# ── Core: get_or_compute (production-grade stampede protection) ──

async def get_or_compute(
    key: str,
    compute_fn,
    ttl: int = CacheTTL.USER_RECS,
) -> tuple[dict, bool]:
    """
    Cache-first with full stampede protection.

    Returns: (result_dict, was_cached)

    Flow:
      1. Try cache → return on hit
      2. Acquire token-based lock → compute → store with jitter → return
      3. If lock taken → bounded retry (3x) → retry cache
      4. Fallback: compute anyway (API must never fail)
    """
    try:
        r = await get_redis()

        # 1. Try cache
        cached = await r.get(key)
        if cached:
            await CacheMetrics.hit()
            return json.loads(cached), True

        await CacheMetrics.miss()
        lock_key = f"lock:{key}"
        token = str(uuid.uuid4())

        # 2. Acquire lock (token-based for safe release)
        if await r.set(lock_key, token, nx=True, ex=5):
            try:
                result = await compute_fn()
                ttl_jitter = ttl + random.randint(0, CacheTTL.JITTER_MAX)
                await r.set(key, json.dumps(result), ex=ttl_jitter)
                return result, False
            finally:
                # Only delete if WE still own the lock
                val = await r.get(lock_key)
                if val == token:
                    await r.delete(lock_key)

        # 3. Another worker is computing → bounded retry
        for _ in range(3):
            await asyncio.sleep(0.05)
            cached = await r.get(key)
            if cached:
                await CacheMetrics.hit()
                return json.loads(cached), True

    except Exception as e:
        logger.warning(f"Redis failed for key={key}: {e}")

    # 4. Fallback: compute without cache (API must never break)
    return await compute_fn(), False
