"""Worker configuration (loaded from env)."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Load `.env` first then `.env.local` so the latter wins, matching the
    # convention used by the Next.js app and our deploy templates.
    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    adaption_api_key: str = Field(default="", alias="ADAPTION_API_KEY")
    elevenlabs_api_key: str = Field(default="", alias="ELEVENLABS_API_KEY")

    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(
        default="", alias="SUPABASE_SERVICE_ROLE_KEY"
    )

    worker_port: int = Field(default=8000, alias="WORKER_PORT")
    worker_shared_secret: str = Field(default="", alias="WORKER_SHARED_SECRET")
    worker_allowed_origins: str = Field(
        default="http://localhost:3000", alias="WORKER_ALLOWED_ORIGINS"
    )

    @property
    def allowed_origins_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.worker_allowed_origins.split(",")
            if origin.strip()
        ]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
