from fastapi import FastAPI

from app.routes import icp, icp_imports, organisations, scores, signals, triggers, users, workspaces, zoominfo_enrich

app = FastAPI(title="SIGNAL Backend")

app.include_router(organisations.router)
app.include_router(workspaces.router)
app.include_router(workspaces.members_router)
app.include_router(users.router)
app.include_router(signals.router)
app.include_router(scores.router)
app.include_router(icp.router)
app.include_router(icp_imports.router)
app.include_router(triggers.router)
app.include_router(zoominfo_enrich.router)
