"""Runtime settings, read from environment variables (or a .env file)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
ROOT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="MEDIPLATE_", extra="ignore")

    database_url: str = f"sqlite:///{BACKEND_DIR / 'mediplate.db'}"
    secret_key: str = "change-me-in-production-please-use-a-long-random-string"
    token_days: int = 7
    admin_email: str = "admin@mediplate.in"
    admin_password: str = "ChangeMe!2026"
    data_dir: Path = APP_DIR / "data"
    models_dir: Path = APP_DIR / "models"
    frontend_dist: Path = ROOT_DIR / "frontend" / "dist"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    solver_seconds_per_day: float = 2.5


@lru_cache
def get_settings() -> Settings:
    return Settings()
