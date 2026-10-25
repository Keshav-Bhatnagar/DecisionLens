from pathlib import Path
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    project_name: str = "DecisionLens API"
    debug: bool = True
    environment: str = "development"

    # Security
    jwt_secret: str = "decisionlens-development-secret-key-change-in-production-min-32-chars"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 720

    # Database
    database_url: str = "sqlite:///./decisionlens.db"

    # Storage
    storage_dir: str = "./storage"
    max_upload_mb: int = 25

    # CORS
    cors_origins: Union[List[str], str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
    ]

    # AI Provider & Model Configuration (Gemini / OpenAI)
    ai_provider: str = "auto"  # auto, gemini, openai, or mock
    gemini_api_key: str = ""
    google_api_key: str = ""
    gemini_model: str = "gemini-3.1-flash-lite"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    whisper_model: str = "whisper-1"

    # External Web Search Provider (duckduckgo, tavily, serper, or mock)
    search_provider: str = "duckduckgo"
    search_api_key: str = ""
    tavily_api_key: str = ""
    serper_api_key: str = ""

    # Optional Speech-to-Text Keys
    google_speech_api_key: str = ""

    # OAuth Identity Providers (Google, GitHub, Microsoft)
    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    microsoft_client_id: str = ""
    microsoft_client_secret: str = ""

    # Supabase Auth Configuration
    supabase_url: str = "https://fzqlmmdfiiwaqawygkyf.supabase.co"
    supabase_anon_key: str = ""

    @property
    def has_ai_key(self) -> bool:
        """Check if any hosted LLM key (Gemini or OpenAI) is configured."""
        return bool(
            (self.gemini_api_key and self.gemini_api_key.strip())
            or (self.google_api_key and self.google_api_key.strip())
            or (self.openai_api_key and self.openai_api_key.strip())
        )

    @property
    def active_ai_provider(self) -> str:
        """Resolve active AI provider: explicit selection or auto-detect by configured keys."""
        prov = (self.ai_provider or "auto").strip().lower()
        if prov in {"gemini", "openai", "mock"}:
            return prov
        if (self.gemini_api_key and self.gemini_api_key.strip()) or (self.google_api_key and self.google_api_key.strip()):
            return "gemini"
        if self.openai_api_key and self.openai_api_key.strip():
            return "openai"
        return "mock"

    @property
    def active_search_provider(self) -> str:
        """Resolve active search provider: explicit selection or auto-detect by configured keys."""
        sp = (self.search_provider or "auto").strip().lower()
        if sp in {"duckduckgo", "tavily", "serper", "mock"}:
            return sp
        if self.tavily_api_key and self.tavily_api_key.strip():
            return "tavily"
        if self.serper_api_key and self.serper_api_key.strip():
            return "serper"
        if self.search_api_key and self.search_api_key.strip():
            return "tavily" if self.search_api_key.strip().startswith("tvly") else "serper"
        return "duckduckgo"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    @property
    def storage_path(self) -> Path:
        p = Path(self.storage_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p


settings = Settings()
