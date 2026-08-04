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
    storage_backend: str = "local"
    oss_endpoint: str = ""
    oss_region: str = "cn-beijing"
    oss_bucket_name: str = ""
    oss_bucket_domain: str = ""
    oss_access_key_id: str = ""
    oss_access_key_secret: str = ""
    oss_recording_prefix: str = "recordings"
    oss_test_prefix: str = "connectivity-tests"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def oss_configured(self) -> bool:
        return all(
            (
                self.oss_endpoint,
                self.oss_bucket_name,
                self.oss_access_key_id,
                self.oss_access_key_secret,
            )
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
