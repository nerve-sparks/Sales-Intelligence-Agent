from fastapi import FastAPI

from app.routes import icp, scores, signals, triggers

app = FastAPI(title="SIGNAL Backend")

app.include_router(signals.router)
app.include_router(scores.router)
app.include_router(icp.router)
app.include_router(triggers.router)
