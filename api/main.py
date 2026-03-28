from fastapi import FastAPI
from contextlib import asynccontextmanager
from core.redis_client import get_redis, close_redis
from routes import recommend
from routes import stats

# Import our new Metadata Extractor
from core.metadata import load_movie_metadata

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: warm up Redis connection
    redis = await get_redis()
    print(f"✅ Redis connected: {await redis.ping()}")
    
    # Pre-cache the 86k Movie DB into Lightning-Fast Python RAM exactly once on Server Boot!
    load_movie_metadata()
    
    yield
    
    # Shutdown: close Redis
    await close_redis()
    print("🔴 Redis connection closed")

from fastapi.middleware.cors import CORSMiddleware

# We disable Swagger validation locally for the schemas because hydrated representations 
# (List of dicts) might violate strict int-schemas temporarily
app = FastAPI(title="Recommendation System", lifespan=lifespan)

# 🔥 Enable CORS so any independent Front-End UI can request recommendations
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Security rule unlocked for local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(recommend.router)
app.include_router(stats.router)