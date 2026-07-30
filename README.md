# SIGNAL — Sales Intelligence Agent

An evidence-based lead-scoring platform. Upload a prospect list (ZoomInfo-shaped
Excel/CSV), and the backend researches each company live on the web (Tavily),
extracts real buying-relevant events with an LLM, deduplicates them into
canonical events, and scores every company with a single transparent formula:

```
Lead Score = clamp(Buying Evidence + Contact Access − Negative Penalty, 0, 100)
```

No ICP gate, no company is ever hidden for scoring low — every uploaded
company gets a score, a confidence label, and an Expected Deal Value band.

## Table of contents

- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Backend](#backend)
  - [Stack](#backend-stack)
  - [The scoring pipeline](#the-scoring-pipeline)
  - [Data model](#data-model)
  - [Notable services](#notable-services)
  - [API reference](#api-reference)
  - [Environment variables](#backend-environment-variables)
  - [Setup](#backend-setup)
- [Frontend](#frontend)
  - [Stack](#frontend-stack)
  - [Authentication](#authentication)
  - [Routing](#routing)
  - [API client](#api-client)
  - [Session state](#session-state)
  - [Setup](#frontend-setup)
- [Known limitations](#known-limitations)
- [License](#license)

## Architecture

**Request flow** — the frontend never talks to the database directly; every
read/write goes through the FastAPI layering below. Every request (other than
signup) carries a Firebase ID token, verified against the real `app_user` /
`workspace_member` rows before a controller runs.

```mermaid
graph LR
    A["React app<br/>src/api/*.ts"] -->|"fetch + Firebase ID token<br/>(VITE_API_BASE_URL)"| B["routes/<br/>APIRouter"]
    B --> C["core/auth.py<br/>verify token + tenant membership"]
    C --> D["controllers/<br/>validate + orchestrate"]
    D --> E["services/<br/>business logic"]
    E --> F["models/<br/>SQLAlchemy ORM"]
    F -->|asyncpg| G[("PostgreSQL")]
    E -->|"live research"| H(["Tavily search"])
    E -->|"event extraction"| I(["LLM: BridgeLLM → DeepSeek → Ollama"])
```

**Data model** — simplified entity relationships for the tables the active
pipeline actually reads and writes. `Signal`, `CompanyNews`, `CompanyScoop`,
`CompanyIntent`, and `IcpProfile` still exist as tables (historical rows, and
`icp_import_batch.icp_id`/`company_import_batch` foreign-key integrity) but
nothing in the active pipeline creates, reads, or scores against them anymore
— see [Known limitations](#known-limitations).

```mermaid
erDiagram
    ORGANISATION ||--o{ WORKSPACE : has
    ORGANISATION ||--o{ APP_USER : has
    ORGANISATION ||--o{ COMPANY : owns
    ORGANISATION ||--o{ DECISION_MAKER : scopes
    WORKSPACE ||--o{ WORKSPACE_MEMBER : has
    APP_USER ||--o{ WORKSPACE_MEMBER : joins
    WORKSPACE ||--o{ TRIGGER_DEFINITION : defines
    WORKSPACE ||--o{ ICP_IMPORT_BATCH : uploads
    COMPANY ||--o{ DECISION_MAKER : employs
    COMPANY ||--o{ COMPANY_IMPORT_BATCH : "appeared in"
    ICP_IMPORT_BATCH ||--o{ COMPANY_IMPORT_BATCH : contains
    COMPANY ||--o{ BUYING_EVENT : has
    COMPANY ||--o| LEAD_SCORE : has
    TRIGGER_DEFINITION ||--o{ TRIGGER_EVENT : fires
    BUYING_EVENT ||--o{ TRIGGER_EVENT : matches
```

## Repository layout

Build artifacts and dependency folders (`backend/venv/`, `frontend/node_modules/`,
`frontend/dist/`, `*.tsbuildinfo`) are omitted below.

```
Sales Intelligence Agent/
├── backend/
│   ├── app/
│   │   ├── main.py                        FastAPI app, CORS, router registration, startup job recovery
│   │   ├── controllers/
│   │   │   ├── auth.py                    GET /auth/me — resolve the current Firebase user
│   │   │   ├── companies.py
│   │   │   ├── icp_imports.py             Prospect upload + per-company job tracking (retry/cancel)
│   │   │   ├── organisations.py
│   │   │   ├── scores.py
│   │   │   ├── signals.py                 "Signals" API — actually reads BuyingEvent
│   │   │   ├── triggers.py
│   │   │   ├── uploads.py                 Logo upload (onboarding)
│   │   │   ├── users.py
│   │   │   └── workspaces.py
│   │   ├── core/
│   │   │   ├── auth.py                    Firebase ID-token verification + tenant-membership checks
│   │   │   ├── config.py                  Env-driven Settings
│   │   │   ├── db.py                      Async engine/session, Base, get_db()
│   │   │   ├── logging_config.py
│   │   │   └── scoring_config.py          Single source of truth for the scoring formula's constants
│   │   ├── models/
│   │   │   ├── buying_event.py            The live evidence table
│   │   │   ├── company.py
│   │   │   ├── company_import_batch.py    Company ↔ upload membership (many-to-many, permanent)
│   │   │   ├── company_intent.py          Legacy — no longer written
│   │   │   ├── company_news.py            Legacy — no longer written
│   │   │   ├── company_scoop.py           Legacy — no longer written
│   │   │   ├── decision_maker.py
│   │   │   ├── icp_import_batch.py        One prospect-upload event (workspace-scoped, ICP-optional)
│   │   │   ├── icp_profile.py             Legacy — kept for historical FK integrity only
│   │   │   ├── lead_score.py
│   │   │   ├── organisation.py
│   │   │   ├── signal.py                  Legacy — no longer written
│   │   │   ├── signal_extraction_check.py Legacy dedup-tracking for the old Signal pipeline
│   │   │   ├── trigger_definition.py
│   │   │   ├── trigger_event.py
│   │   │   ├── user.py
│   │   │   ├── workspace.py
│   │   │   └── workspace_member.py
│   │   ├── routes/                        One file per controller above; registers paths + response_models
│   │   ├── schemas/                       Pydantic request/response models, one file per resource
│   │   └── services/
│   │       ├── buying_event_directory.py  Read-side queries over BuyingEvent (stats, listings, exports)
│   │       ├── buying_event_service.py    Tavily results → canonical, deduplicated, scored BuyingEvents
│   │       ├── company_batch_status.py    Per-company job-stage writes on company_import_batch
│   │       ├── company_directory.py
│   │       ├── evidence_scorer.py         The scoring engine — writes LeadScore rows
│   │       ├── excel_pipeline.py          Excel/CSV ingest, company export
│   │       ├── firebase_client.py         Lazy-initialized Firebase Admin app
│   │       ├── job_recovery.py            Marks jobs interrupted by a backend stop as stopped, not silently resumed
│   │       ├── llm_client.py              3-tier LLM fallback (BridgeLLM → DeepSeek → Ollama), Langfuse-traced
│   │       ├── nexus_scraper.py           Submit-and-poll web scraper client (xsparks.ai profile sync)
│   │       ├── offering_profile_service.py XSparks Offering Profile sync + fallback
│   │       ├── organisation_service.py
│   │       ├── search_signal_ingest.py    Orchestrates per-company Tavily research + extraction, concurrently
│   │       ├── signal_directory.py, signal_extractor.py, signal_scorer.py   Legacy — inert, kept for compatibility
│   │       ├── tavily_client.py           Tavily Advanced Search client
│   │       ├── trigger_matcher.py         Matches TriggerDefinitions against live BuyingEvents
│   │       ├── user_service.py, workspace_service.py
│   │       └── zoominfo_mapper.py         Parses ZoomInfo-shaped Excel/CSV exports (no live ZoomInfo API calls)
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/                      23 migrations; current head: c9f4a2e8b1d3
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── tests/                             pytest — models, evidence scorer, job tracking, trigger matcher
│   ├── static/logos/                      Uploaded organisation logos (served at /static/...)
│   ├── .env                               Local environment config (gitignored)
│   └── Software_PA_Firms_With_ZI_Data.xlsx  Sample ZoomInfo-shaped data file
│
└── frontend/
    ├── src/
    │   ├── main.tsx                       React root
    │   ├── App.tsx                        react-router-dom route table, wrapped in RequireAuth/RequireOnboarding
    │   ├── index.css                      Tailwind entry + global styles
    │   ├── api/                           One file per backend routes/*.py file; client.ts attaches the Firebase token
    │   ├── components/
    │   │   ├── auth/                      RequireAuth, RequireOnboarding
    │   │   ├── brand/Logo.tsx
    │   │   ├── layout/                    Sidebar, TopBar, TopActions, PageTransition
    │   │   ├── ui/                        Button, Checkbox, Input, dataviz.tsx (inline SVG charts)
    │   │   └── OfferingProfileCard.tsx
    │   ├── features/
    │   │   ├── auth/LoginPage.tsx         Login + signup + MFA (mode-switched on one page)
    │   │   ├── onboarding/OnboardingPage.tsx
    │   │   ├── dashboard/                 DashboardPage + LeadGlobe (lazy-loaded react-globe.gl)
    │   │   ├── signal-intelligence/       Signal Feed / Detail / Analytics — all read BuyingEvent via the signals API
    │   │   ├── trigger-intelligence/      Trigger Library / Detail / Editor
    │   │   ├── crm-intelligence/          Enterprise List/Detail, Buying Committee, Member Detail, Score Breakdown/History
    │   │   └── settings/SettingsIcpDataPage.tsx   Organization panel, workspace/members, prospect uploads, job monitor
    │   ├── lib/
    │   │   ├── firebase.ts                Firebase app/auth init (VITE_FIREBASE_* env vars)
    │   │   ├── useAuth.ts                 Firebase auth-state hook
    │   │   ├── CurrentUserContext.tsx      Resolves the logged-in person once, above the router
    │   │   ├── postLogin.ts               GET /auth/me → routes to /dashboard or /onboarding
    │   │   ├── session.ts                 localStorage organisation_id / workspace_id
    │   │   ├── signalCategories.ts        Shared signal-category labels/icons/colors
    │   │   └── cn.ts                      clsx + tailwind-merge helper
    │   └── assets/                        Figma-exported SVGs/PNGs, globe textures
    ├── CLAUDE.md                          Frontend conventions reference
    ├── index.html / package.json / vite.config.ts / eslint.config.js / tsconfig*.json
    └── .env                                VITE_API_BASE_URL + VITE_FIREBASE_* (gitignored)
```

## Quick start

Two terminals, one Postgres database, one Firebase project.

```bash
# Terminal 1 — backend (http://localhost:8175)
cd backend
python -m venv venv && ./venv/Scripts/activate
pip install -r requirements.txt
echo "DATABASE_URL=postgresql+asyncpg://signal_user:password@localhost:5432/signal" > .env
alembic upgrade head
python -m uvicorn app.main:app --port 8175
```

```bash
# Terminal 2 — frontend (http://localhost:5173)
cd frontend
npm install
# .env needs VITE_API_BASE_URL and the VITE_FIREBASE_* keys — see below
npm run dev
```

Without the Firebase keys the app still builds and runs, but every route
redirects to the login page and stays there (`RequireAuth` never resolves a
user) — see [Authentication](#authentication).

Full detail on each side is in the [Backend](#backend) and
[Frontend](#frontend) sections below.

## Backend

### Backend stack

| Package | Version |
|---|---|
| fastapi | 0.115.6 |
| uvicorn[standard] | 0.34.0 |
| pydantic | 2.10.4 |
| sqlalchemy[asyncio] | 2.0.36 |
| asyncpg | 0.30.0 |
| psycopg[binary] | 3.2.3 |
| alembic | 1.14.0 |
| openai | 2.46.0 |
| langfuse | 4.14.1 |
| firebase-admin | 7.5.0 |
| openpyxl | 3.1.5 |
| python-multipart | 0.0.20 |
| httpx | 0.28.1 |
| pytest / pytest-asyncio | 8.3.4 / 0.25.2 |

Python 3.11 (per the committed virtual environment's `pyvenv.cfg`; not pinned
anywhere else in the repo).

### The scoring pipeline

Everything below lives in `app/core/scoring_config.py` (every constant, in one
place, so the formula is auditable and tunable without hunting through
services) and is executed by `evidence_scorer.py` / `buying_event_service.py`.

**1. Upload** (`POST /workspaces/{id}/imports/excel`) — `excel_pipeline.py`
parses a ZoomInfo-shaped `.xlsx`/`.csv` (via `zoominfo_mapper.py`), upserts
`Company` + `DecisionMaker` rows synchronously, records an `IcpImportBatch` +
one `CompanyImportBatch` row per company, and returns immediately with
`scoring_status="pending"` while research runs in the background.

**2. Research** (`search_signal_ingest.py`) — one Tavily Advanced Search call
per company (skipped if that company was researched within the last 10 days —
`Company.search_signals_fetched_at`), run with bounded concurrency
(`RESEARCH_CONCURRENCY`, default 10).

**3. Extraction & dedup** (`buying_event_service.py`) — each Tavily result is
judged by an LLM: is this a real, current, XSparks-relevant buying event for
*this* company? Multiple articles about the same real-world event (company
announcement + wire pickup + industry writeup) collapse into one canonical
`BuyingEvent` via a `(company_id, canonical_key)` unique constraint — never
several scored signals for one event.

**4. Deterministic scoring** — each unique event gets one score:

```
event_score = base_strength × relevance × freshness × source_quality
              × extraction_confidence × status_factor
```

Corroborating sources raise confidence later; they never add another event
score. Per-event inputs (`BASE_STRENGTH` by event type, freshness bands by
event age, source-quality by domain type, status factor by lifecycle stage)
are all tables in `scoring_config.py`.

**5. Company-level rollup** (`evidence_scorer.py`) —

```
Buying Evidence  = weighted sum of the strongest 3 independent event scores  [1.00, 0.60, 0.40], capped at 80
Contact Access   = best single reachable contact only, never summed          (0–20)
Negative Penalty = sum of unique negative-event penalties, capped at 100
Lead Score       = clamp(Buying Evidence + Contact Access − Negative Penalty, 0, 100)
```

Revenue, employee count, and funding are **deliberately absent** from Lead
Score — they only ever feed Expected Deal Value, a separate cold-start
revenue-capacity band. There is no ICP gate: every uploaded company is scored
and shown, regardless of score.

**6. Bands** — labels only, never gates, calibrated against the real observed
score distribution (a genuinely strong company with several real signals and
a reachable buyer lands ~65–77, not 85+):

| Threshold | Label |
|---|---|
| 65+ | Sales Ready |
| 50+ | High Priority |
| 35+ | Warm |
| 20+ | Monitor |
| 0+ | Low Priority |

Confidence (High/Medium/Low/Insufficient Evidence) is computed independently
of score — a low score never implies low confidence, and no evidence means
"Insufficient Evidence," not a fabricated low score.

### Data model

| Model | Table | Notes |
|---|---|---|
| `Organisation` | `organisation` | Tenant root. Has many `Workspace`, many `User`. Also holds the XSparks Offering Profile used by the LLM relevance judgement. |
| `Workspace` | `workspace` | Belongs to `Organisation`. Owns `TriggerDefinition`s and prospect uploads (`IcpImportBatch`); membership via `WorkspaceMember`. |
| `User` | `app_user` | Belongs to `Organisation`. Tied to a Firebase account via `firebase_uid`. |
| `WorkspaceMember` | `workspace_member` | Join table between `Workspace` and `User`, carries a `role`. |
| `Company` | `company` | Belongs to `Organisation`. Has many `DecisionMaker`, `BuyingEvent`, `CompanyImportBatch`; one `LeadScore`. |
| `DecisionMaker` | `decision_maker` | Belongs to `Organisation` and `Company`. Contact/buying-committee member; persona classified from job title. |
| `CompanyImportBatch` | `company_import_batch` | Permanent many-to-many membership between a `Company` and every upload it appeared in — a company re-uploaded three times has three rows here, tracked per-company (`queued`→`researching`→`scoring`→`completed`/`failed`/`needs_review`) so a single company in a batch is independently retryable. |
| `IcpImportBatch` | `icp_import_batch` | One prospect-upload event (audit record). Workspace-scoped; `icp_id` is nullable/legacy. |
| `BuyingEvent` | `buying_event` | **The live evidence table.** One canonical real-world event per company, with its full scoring breakdown and source evidence array. |
| `LeadScore` | `lead_score` | Belongs to `Company`, one-to-one. Buying Evidence / Contact Access / Negative Penalty breakdown + final score, band, confidence, Expected Deal Value. |
| `TriggerDefinition` | `trigger_definition` | Belongs to `Workspace`. An alerting rule: `signal_categories[]` + `min_event_score`, matched directly against `BuyingEvent`. |
| `TriggerEvent` | `trigger_event` | Links a `TriggerDefinition`, a `BuyingEvent`, and a `Company` — one occurrence of a trigger matching a real event. All three FKs cascade on delete. |
| `Signal`, `CompanyNews`, `CompanyScoop`, `CompanyIntent`, `IcpProfile` | — | **Legacy.** Nothing in the active pipeline instantiates these anymore; retained only for historical rows and foreign-key integrity. |

Multi-tenancy shape: **Organisation → Workspace → WorkspaceMember ↔ User**;
`Company`, `BuyingEvent`, and `LeadScore` are organisation-scoped, while
`TriggerDefinition` and prospect uploads are workspace-scoped.

### Notable services

| Service | Purpose |
|---|---|
| `services/evidence_scorer.py` | The scoring engine — computes Buying Evidence / Contact Access / Negative Penalty and writes `LeadScore` rows. |
| `services/buying_event_service.py` | Turns raw Tavily results into canonical, deduplicated, deterministically-scored `BuyingEvent` rows. |
| `services/search_signal_ingest.py` | Orchestrates concurrent per-company research (Tavily + extraction) for a given upload's companies. |
| `services/tavily_client.py` | One Tavily Advanced Search call per company — a single broad, keyword-dense query covering funding, leadership, procurement, hiring, etc. |
| `services/llm_client.py` | 3-tier LLM fallback — BridgeLLM (Gemini 2.5 Flash-Lite, primary) → DeepSeek (fallback) → Ollama (last resort). Every call traced in Langfuse. |
| `services/excel_pipeline.py` | Excel/CSV import via `openpyxl` + `zoominfo_mapper.py`, company export with full scoring. |
| `services/trigger_matcher.py` | Matches `TriggerDefinition`s against live `BuyingEvent`s, applying the same `is_stale`/`is_negative` exclusions the scorer applies. |
| `services/job_recovery.py` | On startup, marks any job left mid-flight by a backend stop as stopped/retryable rather than silently resuming it. |
| `services/offering_profile_service.py`, `nexus_scraper.py` | Scrapes xsparks.ai and asks the LLM to structure it into the Offering Profile the scorer uses for relevance judgements; falls back to a static profile if scraping/LLM fails. |
| `services/company_batch_status.py` | Per-company job-stage writes so one upload's job is inspectable/retryable company-by-company. |

### API reference

No global path prefix. Base URL in local development: `http://localhost:8175`.
Every route below except `POST /organisations` (account creation) and
`POST /uploads/logo` requires a valid Firebase ID token; routes under
`/organisations/{organisation_id}/...` additionally require real membership
in that organisation, and routes under `/workspaces/{workspace_id}/...`
require real membership in that workspace (`app/core/auth.py`).

<details>
<summary><strong>Auth, Organisations, Workspaces, Users</strong></summary>

| Method | Path |
|---|---|
| `GET` | `/auth/me` |
| `POST` | `/organisations` |
| `GET` | `/organisations/{organisation_id}` |
| `PUT` | `/organisations/{organisation_id}` |
| `POST` | `/organisations/{organisation_id}/offering-profile/sync` |
| `POST` | `/organisations/{organisation_id}/workspaces` |
| `GET` | `/organisations/{organisation_id}/workspaces` |
| `POST` | `/workspaces/{workspace_id}/members` |
| `GET` | `/workspaces/{workspace_id}/members` |
| `POST` | `/organisations/{organisation_id}/users` |
| `PUT` | `/organisations/{organisation_id}/users/{user_id}` |

</details>

<details>
<summary><strong>Companies</strong></summary>

| Method | Path |
|---|---|
| `GET` | `/organisations/{organisation_id}/companies` |
| `GET` | `/organisations/{organisation_id}/companies/stats` |
| `GET` | `/organisations/{organisation_id}/companies/insight` |
| `GET` | `/organisations/{organisation_id}/companies/export` — returns an `.xlsx` file |
| `GET` | `/organisations/{organisation_id}/companies/{company_id}` |
| `GET` | `/organisations/{organisation_id}/companies/{company_id}/decision-makers` |
| `GET` | `/organisations/{organisation_id}/decision-makers/{decision_maker_id}` |

</details>

<details>
<summary><strong>Signals (BuyingEvent) & Scores</strong></summary>

| Method | Path |
|---|---|
| `GET` | `/organisations/{organisation_id}/signals` |
| `GET` | `/organisations/{organisation_id}/signals/stats` |
| `GET` | `/organisations/{organisation_id}/signals/detail/{signal_id}` |
| `GET` | `/organisations/{organisation_id}/signals/{company_id}` |
| `POST` | `/organisations/{organisation_id}/signals/extract` — legacy, always returns `{inserted: 0, skipped: 0}` |
| `POST` | `/organisations/{organisation_id}/signals/rescore` — legacy, inert |
| `POST` | `/organisations/{organisation_id}/scores/run` |
| `GET` | `/organisations/{organisation_id}/scores/ranked` |
| `GET` | `/organisations/{organisation_id}/scores/{company_id}` |

</details>

<details>
<summary><strong>Prospect imports & job tracking</strong></summary>

| Method | Path |
|---|---|
| `POST` | `/workspaces/{workspace_id}/imports/excel` — multipart, accepts multiple files |
| `GET` | `/workspaces/{workspace_id}/imports` |
| `GET` | `/workspaces/{workspace_id}/imports/{import_batch_id}` |
| `GET` | `/workspaces/{workspace_id}/imports/{import_batch_id}/items` |
| `POST` | `/workspaces/{workspace_id}/imports/{import_batch_id}/retry-failed` |
| `POST` | `/workspaces/{workspace_id}/imports/{import_batch_id}/cancel` |

</details>

<details>
<summary><strong>Triggers</strong></summary>

| Method | Path |
|---|---|
| `POST` | `/workspaces/{workspace_id}/triggers` |
| `GET` | `/workspaces/{workspace_id}/triggers` |
| `GET` | `/workspaces/{workspace_id}/triggers/insight` |
| `GET` | `/workspaces/{workspace_id}/triggers/{trigger_id}/events` |
| `POST` | `/workspaces/{workspace_id}/triggers/{trigger_id}/mark-seen` |
| `DELETE` | `/workspaces/{workspace_id}/triggers/{trigger_id}` |

</details>

<details>
<summary><strong>Uploads</strong></summary>

| Method | Path |
|---|---|
| `POST` | `/uploads/logo` — requires login only, no organisation yet (onboarding) |

</details>

### Backend environment variables

`backend/.env` (gitignored):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Async SQLAlchemy URL, e.g. `postgresql+asyncpg://signal_user:password@localhost:5432/signal`. App raises at startup if unset. |
| `APP_ENV` | No | Defaults to `local`. |
| `LOG_LEVEL` | No | Defaults to `INFO`. |
| `FIREBASE_CREDENTIALS_PATH` | Yes (for any authenticated route) | Path to a Firebase Admin service-account JSON. Every route but `POST /organisations` and `POST /uploads/logo` needs a verified token. |
| `TAVILY_API_KEY` | Yes (for research) | Live web research per company during an upload. |
| `LLM_API_KEY` | One of these three | BridgeLLM (primary) — Gemini 2.5 Flash-Lite via an OpenAI-compatible proxy. |
| `DEEPSEEK_API_KEY` | One of these three | DeepSeek (fallback) — fast, cheap, genuinely concurrent. |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | One of these three | Ollama (last resort) — self-hosted, slow, free. Defaults point at a working local deployment. |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST` | No | Traces every LLM call (model, tokens, full input/output) if set. |
| `SCRAPER_SERVICE_URL` / `SCRAPER_API_KEY` | No | Nexus Scraper — used only to refresh the XSparks Offering Profile from xsparks.ai; falls back to a static profile if unset. |
| `RESEARCH_CONCURRENCY` | No | Defaults to `10`. Concurrent companies researched at once during an upload. |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | No | Defaults scale with `RESEARCH_CONCURRENCY`; raise together, not independently. |

For Alembic migrations, `DATABASE_URL` is reused with `+asyncpg` swapped for
`+psycopg` (`database_url_sync` in `core/config.py`), since migrations run
over the sync driver.

### Backend setup

```bash
cd backend
python -m venv venv
./venv/Scripts/activate        # Windows; use `source venv/bin/activate` on macOS/Linux
pip install -r requirements.txt

# Create backend/.env with at least DATABASE_URL and FIREBASE_CREDENTIALS_PATH
# (see table above — TAVILY_API_KEY + one LLM provider needed for uploads to do anything)

alembic upgrade head
python -m uvicorn app.main:app --port 8175
```

CORS allows any `localhost`/`127.0.0.1` origin on any port (`allow_origin_regex`),
to accommodate Vite's floating dev-server port. Uploaded logos are served
from `/static/logos/...` via a `StaticFiles` mount.

Run tests with `pytest` from `backend/` (`tests/`: model integration,
evidence scorer, job tracking, trigger matcher — 40 tests as of the last run).

## Frontend

### Frontend stack

| Package | Version |
|---|---|
| react / react-dom | ^19.0.0 |
| react-router-dom | ^7.18.1 |
| firebase | ^12.16.0 |
| vite | ^6.0.6 |
| tailwindcss / @tailwindcss/vite | ^4.1.11 |
| typescript | ^5.7.2 |
| lucide-react | ^0.468.0 |
| react-globe.gl | ^2.38.0 |
| react-svg-worldmap | ^2.0.2 |
| three | ^0.185.1 |
| clsx / tailwind-merge | ^2.1.1 / ^2.5.5 |

### Authentication

Real Firebase Authentication, not a placeholder. `lib/firebase.ts` initializes
the app from `VITE_FIREBASE_*` env vars; `lib/useAuth.ts` tracks Firebase's
live auth state; `api/client.ts` attaches the current user's ID token as a
`Bearer` header on every request (`app/core/auth.py` verifies it server-side).

Two route guards compose above every page in `App.tsx`:
- **`RequireAuth`** — no Firebase user → redirect to `/` (`LoginPage`, which
  internally covers login/signup/MFA by mode-switching on `window.location.pathname`).
- **`RequireOnboarding`** — Firebase user but no `organisation_id` in
  `lib/session.ts` yet → redirect to `/onboarding`.

`lib/postLogin.ts` resolves where a just-authenticated user should land by
calling `GET /auth/me` (never trusting a stale local session), populating
`session.ts` if a real backend account is found.

### Routing

Client-side routing via `react-router-dom` (`BrowserRouter`/`Routes`/`Route`
in `src/App.tsx`), each route wrapped in `PageTransition` for a fade-in on
mount, and in `RequireAuth`/`RequireOnboarding` as above.

| Path | Page |
|---|---|
| `/`, and unrecognized paths | `LoginPage` (covers login/signup/MFA internally) |
| `/onboarding` | `OnboardingPage` |
| `/dashboard` | `DashboardPage` |
| `/signal-intelligence` | `SignalIntelligencePage` |
| `/signal-feed` | `SignalFeedPage` |
| `/signal-detail` | `SignalDetailPage` |
| `/signal-analytics` | `SignalAnalyticsPage` |
| `/trigger-library` | `TriggerLibraryPage` |
| `/trigger-details` | `TriggerDetailPage` |
| `/trigger-editor` | `TriggerEditorPage` |
| `/enterprise-list` | `EnterpriseListPage` |
| `/enterprise-detail` | `EnterpriseDetailPage` |
| `/buying-committee` | `BuyingCommitteePage` |
| `/member-detail` | `MemberDetailPage` |
| `/score-breakdown` | `ScoreBreakdownPage` |
| `/score-history` | `ScoreHistoryPage` |
| `/settings` | `SettingsIcpDataPage` — organisation profile, workspace/members, prospect uploads, per-company job monitor |

Sidebar navigation (`components/layout/Sidebar.tsx`) uses `Link` for
client-side transitions; most in-page navigation (row clicks, card clicks)
still uses `window.location.href` (full page reload).

### API client

`src/api/client.ts` provides a shared `fetch` wrapper (`apiGet`/`apiPost`/
`apiPut`/`apiDelete`/`apiPostForm`/`apiPostForBlob`/`apiGetForBlob`, plus an
`ApiError` type) reading
`VITE_API_BASE_URL` (default `http://localhost:8175`) and attaching the
current Firebase ID token. One file per backend resource: `auth.ts`,
`organisations.ts`, `workspaces.ts`, `users.ts`, `companies.ts`, `signals.ts`,
`scores.ts`, `icp.ts` (imports/job endpoints), `prospectImports.ts`,
`triggers.ts`, `uploads.ts`.

### Session state

`src/lib/session.ts` stores the current `organisation_id`/`workspace_id` in
`localStorage`, set once during onboarding (or resolved via `postLogin.ts` on
a returning login). This is separate from Firebase auth state — a signed-in
Firebase user might not have an organisation yet, which is exactly what
`RequireOnboarding` checks for.

### Frontend setup

```bash
cd frontend
npm install                     # behind a corporate TLS proxy: NODE_OPTIONS=--use-system-ca npm install
```

`frontend/.env`:

```
VITE_API_BASE_URL=http://localhost:8175
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

```bash
npm run dev
```

| Script | Command |
|---|---|
| `npm run dev` | `vite --host 0.0.0.0` |
| `npm run build` | `tsc -b && vite build` |
| `npm run preview` | `vite preview --host 0.0.0.0` |
| `npm run lint` | `eslint .` |

See `frontend/CLAUDE.md` for design-system conventions (colors, spacing,
shared components) followed across every page.

## Known limitations

- **Legacy dead tables**: `Signal`, `CompanyNews`, `CompanyScoop`,
  `CompanyIntent`, and `IcpProfile` still exist in the schema and are read by
  a couple of backward-compatible endpoints (`POST .../signals/extract`,
  `.../rescore`, both always inert), but nothing in the active pipeline writes
  to them. They're kept only for historical rows and foreign-key integrity —
  new features should never be built against them.
- **No live ZoomInfo API integration**: the ZoomInfo *client*/*enrich* services
  from earlier in the project were removed; only `zoominfo_mapper.py` remains,
  which parses ZoomInfo-shaped Excel/CSV exports on upload. There is no live
  call to ZoomInfo's API anywhere in the current backend.
- **LLM tiering has real tradeoffs**: BridgeLLM (primary) is slower (~21s/call)
  and less selective at rejecting non-events than DeepSeek; this is a known,
  deliberate tradeoff (see `llm_client.py`'s docstring), not an oversight.
- **No frontend test suite** — verification is `tsc -b` + `eslint` + manual
  browser checks; there is no Jest/Vitest/Playwright setup.
- **In-process background jobs**: uploads run research/scoring as an in-process
  `asyncio` task via FastAPI `BackgroundTasks`, not a durable queue. A backend
  restart mid-job marks it stopped/retryable (`job_recovery.py`) rather than
  losing it silently, but it does not resume automatically.

## License

No `LICENSE` file is currently present in this repository.
