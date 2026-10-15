import os
from pathlib import Path
from typing import List, Union
from pydantic_settings import BaseSettings, SettingsConfigDict

# Locate the root .env file if available, or local .env
ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
ROOT_ENV_PATH = ROOT_DIR / ".env"
LOCAL_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

env_file = ROOT_ENV_PATH if ROOT_ENV_PATH.exists() else LOCAL_ENV_PATH

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(env_file) if env_file.exists() else None,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    APP_NAME: str = "DecisionLens API"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    # Security
    SECRET_KEY: str = "dev_secret_key_decisionlens_super_secret_replace_in_prod"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    CORS_ORIGINS: Union[List[str], str] = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000"

    @property
    def cors_origins_list(self) -> List[str]:
        if isinstance(self.CORS_ORIGINS, str):
            return [i.strip() for i in self.CORS_ORIGINS.split(",") if i.strip()]
        return self.CORS_ORIGINS

    # Database
    DATABASE_URL: str = "sqlite:///./decisionlens.db"

    # LLM Providers (backend only)
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    DEFAULT_LLM_PROVIDER: str = "gemini"

    # Search Providers (backend only)
    TAVILY_API_KEY: str = ""
    SERPAPI_API_KEY: str = ""

    # Media & STT
    STT_PROVIDER: str = "local_whisper"
    AUDIO_TEMP_DIR: str = "./data/audio_temp"
    MAX_UPLOAD_SIZE_MB: int = 100

settings = Settings()
