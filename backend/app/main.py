from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.logging_config import configure_logging
from app.routes import (
    auth,
    companies,
    icp_imports,
    organisations,
    scores,
    signals,
    triggers,
    uploads,
    users,
    workspaces,
)
from app.services.job_recovery import resume_interrupted_jobs

configure_logging()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Crash-recovery: a batch left mid-flight when the process last stopped
    # (deploy, crash, dev-server reload) has no in-memory BackgroundTask left
    # to finish it - without this it would show 'pending' in Postgres
    # forever. Resumes each such job's background processing on startup.
    await resume_interrupted_jobs()
    yield


app = FastAPI(title="SIGNAL Backend", lifespan=lifespan)

# Serves uploaded assets (e.g. onboarding's organisation logo) back out at
# the /static/... URL controllers/uploads.py returns.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

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
    # Evidence-pipeline import counts (brief section 31). The legacy
    # X-Matched-Icp/X-Active-Count/X-Nurture-Count headers are dropped from the
    # active product; structured JSON (ImportBatchOut) is preferred over headers.
    expose_headers=[
        "Content-Disposition", "X-Files-Processed", "X-Total-Rows", "X-Companies-Ingested",
        "X-Signals-Extracted", "X-Sales-Ready-Count", "X-High-Priority-Count",
        "X-Warm-Count", "X-Monitor-Count", "X-Low-Priority-Count",
    ],
)

app.include_router(auth.router)
app.include_router(organisations.router)
app.include_router(workspaces.router)
app.include_router(workspaces.members_router)
app.include_router(users.router)
app.include_router(companies.router)
app.include_router(companies.decision_makers_router)
app.include_router(signals.router)
app.include_router(scores.router)
app.include_router(icp_imports.router)
app.include_router(triggers.router)
app.include_router(uploads.router)
