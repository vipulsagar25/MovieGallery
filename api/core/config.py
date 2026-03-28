from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "Recommendation System"
    debug: bool = True
    host: str = "127.0.0.1"
    port: int = 8000

    # Redis config (for later)
    redis_url: str = "redis://localhost:6379"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
