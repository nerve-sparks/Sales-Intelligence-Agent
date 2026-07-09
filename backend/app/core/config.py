import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    app_env: str
    log_level: str
    database_url: str

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
    )
