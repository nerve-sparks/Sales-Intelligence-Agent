from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import (
    companies,
    icp,
    icp_imports,
    organisations,
    scores,
    signals,
    triggers,
    users,
    workspaces,
    zoominfo_enrich,
)

app = FastAPI(title="SIGNAL Backend")

# Vite's dev server picks whatever port is free (5173, 5174, 5175, ...) - allow
# any localhost/127.0.0.1 origin rather than hardcoding one port.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Browsers only expose a small CORS-safelisted set of response headers
    # to JS by default - custom X-* headers (e.g. the Excel import pipeline
    # stats) are invisible to fetch()'s response.headers without this.
    expose_headers=["Content-Disposition", "X-Files-Processed", "X-Total-Rows", "X-Companies-Ingested", "X-Signals-Extracted", "X-Matched-Icp", "X-Active-Count", "X-Nurture-Count"],
)

app.include_router(organisations.router)
app.include_router(workspaces.router)
app.include_router(workspaces.members_router)
app.include_router(users.router)
app.include_router(companies.router)
app.include_router(companies.decision_makers_router)
app.include_router(signals.router)
app.include_router(scores.router)
app.include_router(icp.router)
app.include_router(icp_imports.router)
app.include_router(triggers.router)
app.include_router(zoominfo_enrich.router)
