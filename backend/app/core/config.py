from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "随机口语训练器"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./speaking_lab.db"
    jwt_secret: str = "local-development-secret-change-me-now"
    access_token_expire_minutes: int = 720
    upload_max_mb: int = 20
    cors_origins: str = "http://localhost:5173"
    upload_dir: str = "uploads"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
