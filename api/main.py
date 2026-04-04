import logging
from fastapi import FastAPI, Request
from fastapi.responses import ORJSONResponse
from contextlib import asynccontextmanager
from mangum import Mangum
from core.redis_client import get_redis, close_redis
from core.metadata import load_movie_metadata
from core.config import get_settings
from routes import recommend, stats, health, auth, ratings

from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──
    redis = await get_redis()
    pong = await redis.ping()
    logger.info(f"Redis connected: {pong}")

    # Pre-warm 86k movie metadata into RAM exactly once on boot
    load_movie_metadata()
    logger.info("Movie metadata loaded into memory cache")

    yield

    # ── Shutdown ──
    await close_redis()
    logger.info("Redis connection closed — server shutdown clean")


app = FastAPI(
    title="Movie Gallery Recommendation Engine",
    description="Production-grade collaborative filtering API. Netflix-scale architecture.",
    version="2.0.0",
    lifespan=lifespan,
    default_response_class=ORJSONResponse,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──
app.include_router(health.router)
app.include_router(recommend.router)
app.include_router(stats.router)
app.include_router(auth.router)
app.include_router(ratings.router)



# Forced reload trigger
# ── Dynamic Config (for Frontend) ──
@app.get("/config")
async def get_frontend_config():
    """
    Serves public environment variables to the frontend.
    These are the keys/URLs previously hardcoded in JS.
    """
    settings = get_settings()
    return {
        "supabase_url": settings.supabase_url,
        "supabase_anon_key": settings.supabase_anon_key,
        "api_url": f"http://{settings.host}:{settings.port}"
    }

# AWS Lambda Handler
handler = Mangum(app)