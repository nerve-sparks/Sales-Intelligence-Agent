import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    app_env: str
    log_level: str
    database_url: str
    llm_api_key: str | None
    ollama_base_url: str
    ollama_model: str
    firebase_credentials_path: str | None

    @property
    def database_url_sync(self) -> str:
        return self.database_url.replace("+asyncpg", "+psycopg")


def get_settings() -> Settings:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is not set")

    return Settings(
        app_env=os.environ.get("APP_ENV", "local"),
        log_level=os.environ.get("LOG_LEVEL", "INFO"),
        database_url=database_url,
        llm_api_key=os.environ.get("LLM_API_KEY"),
        # Defaults match the verified-working local fallback server, so this
        # keeps working even in environments where the .env var isn't set.
        ollama_base_url=os.environ.get("OLLAMA_BASE_URL", "http://124.123.18.150:11434/v1"),
        ollama_model=os.environ.get("OLLAMA_MODEL", "qwen3:14b"),
        firebase_credentials_path=os.environ.get("FIREBASE_CREDENTIALS_PATH"),
    )
