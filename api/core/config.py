from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "Movie Gallery"
    debug: bool = True
    host: str = "127.0.0.1"
    port: int = 8000

    # Redis config (for later)
    redis_url: str = "redis://localhost:6379"

    # TMDB Credentials (from .env)
    tmdb_api_key: str = ""
    tmdb_read_token: str = ""

    # Supabase Credentials (from .env)
    supabase_url: str = ""
    supabase_anon_key: str = ""

    class Config:
        env_file = "c:/Users/91733/Desktop/Recomm~~10k/.env"
        env_file_encoding = 'utf-8'
        extra = "ignore"  # Ensure extra env vars don't crash the app



@lru_cache()
def get_settings() -> Settings:
    return Settings()
