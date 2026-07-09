from fastapi import FastAPI
from sqlalchemy import text

from app.core.db import async_session_maker

app = FastAPI(title="SIGNAL Backend")


@app.get("/health")
async def health() -> dict:
    db_status = "ok"
    try:
        async with async_session_maker() as session:
            await session.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001
        db_status = f"unreachable: {exc}"

    return {"status": "ok", "db": db_status}
