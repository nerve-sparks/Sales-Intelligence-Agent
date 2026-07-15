from fastapi import FastAPI

from app.routes import icp, organisations, scores, signals, triggers, users, workspaces

app = FastAPI(title="SIGNAL Backend")

app.include_router(organisations.router)
app.include_router(workspaces.router)
app.include_router(workspaces.members_router)
app.include_router(users.router)
app.include_router(signals.router)
app.include_router(scores.router)
app.include_router(icp.router)
app.include_router(triggers.router)
