"""
Health check router — required by all production load balancers.
AWS ALB, GCP, Kubernetes liveness/readiness probes all hit this endpoint.
"""
import time
from fastapi import APIRouter
from fastapi.responses import ORJSONResponse
from core.redis_client import get_redis

router = APIRouter(prefix="/health", tags=["observability"])

# Track server start time for uptime reporting
SERVER_START = time.time()


@router.get("", response_class=ORJSONResponse)
async def health_check():
    """
    Primary health check. Returns 200 OK with system status.
    Used by load balancers to route traffic only to healthy instances.
    """
    uptime_seconds = int(time.time() - SERVER_START)
    redis_ok = False

    try:
        r = await get_redis()
        redis_ok = await r.ping()
    except Exception:
        redis_ok = False

    status = "ok" if redis_ok else "degraded"

    return {
        "status": status,
        "redis": redis_ok,
        "uptime_seconds": uptime_seconds,
    }


@router.get("/ready", response_class=ORJSONResponse)
async def readiness_check():
    """
    Kubernetes readiness probe — only returns 200 when fully ready to serve.
    """
    try:
        r = await get_redis()
        if await r.ping():
            return {"ready": True}
    except Exception:
        pass
    from fastapi import HTTPException
    raise HTTPException(status_code=503, detail="Service not ready")
