from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

# pool_size/max_overflow scale with settings.research_concurrency (see
# config.py) - the background research pipeline opens one DB session per
# concurrently-researched company, on top of normal request traffic; the
# SQLAlchemy async engine's default (pool_size=5, max_overflow=10) is sized
# for request/response traffic alone and would bottleneck a raised
# RESEARCH_CONCURRENCY on "waiting for a free connection" instead of Serper/LLM.
engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session
