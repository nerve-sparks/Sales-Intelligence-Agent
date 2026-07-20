<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white" alt="Python 3.11">
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white" alt="FastAPI 0.115">
  <img src="https://img.shields.io/badge/SQLAlchemy-2.0%20async-D71F00" alt="SQLAlchemy 2.0 async">
  <img src="https://img.shields.io/badge/PostgreSQL-async-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" alt="Vite 6">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4">
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.7">
</p>

# SIGNAL — Sales Intelligence Agent

A sales intelligence platform and it ingests firmographic and buying-intent data, extracts signals, scores leads against a 5-gate / 7-dimension model, matches companies against configurable Ideal Customer Profiles (ICPs) and Triggers.

> **Project status:** active development, pre-authentication. See [Known limitations](#known-limitations) before treating anything here as production-ready.

## Table of contents

- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Backend](#backend)
  - [Stack](#backend-stack)
  - [Data model](#data-model)
  - [Notable services](#notable-services)
  - [API reference](#api-reference)
  - [Environment variables](#backend-environment-variables)
  - [Setup](#backend-setup)
- [Frontend](#frontend)
  - [Stack](#frontend-stack)
  - [Routing](#routing)
  - [API client](#api-client)
  - [Session state](#session-state)
  - [Setup](#frontend-setup)
- [Known limitations](#known-limitations)
- [License](#license)

## Architecture

**Request flow** — the frontend never talks to the database directly; every read/write goes through the FastAPI layering below.

```mermaid
graph LR
    A["React app<br/>src/api/*.ts"] -->|"fetch (VITE_API_BASE_URL)"| B["routes/<br/>APIRouter"]
    B --> C["controllers/<br/>validate + orchestrate"]
    C --> D["services/<br/>business logic"]
    D --> E["models/<br/>SQLAlchemy ORM"]
    E -->|asyncpg| F[("PostgreSQL")]
```

**Data model** — simplified entity relationships (see the full [data model](#data-model) table for every table).

```mermaid
erDiagram
    ORGANISATION ||--o{ WORKSPACE : has
    ORGANISATION ||--o{ APP_USER : has
    ORGANISATION ||--o{ COMPANY : owns
    ORGANISATION ||--o{ DECISION_MAKER : scopes
    WORKSPACE ||--o{ WORKSPACE_MEMBER : has
    APP_USER ||--o{ WORKSPACE_MEMBER : joins
    WORKSPACE ||--o{ ICP_PROFILE : defines
    WORKSPACE ||--o{ TRIGGER_DEFINITION : defines
    COMPANY ||--o{ DECISION_MAKER : employs
    COMPANY ||--o{ COMPANY_INTENT : has
    COMPANY ||--o{ COMPANY_NEWS : has
    COMPANY ||--o{ COMPANY_SCOOP : has
    COMPANY ||--o{ SIGNAL : has
    COMPANY ||--o| LEAD_SCORE : has
    TRIGGER_DEFINITION ||--o{ TRIGGER_EVENT : fires
    SIGNAL ||--o{ TRIGGER_EVENT : matches
```

## Repository layout

Build artifacts and dependency folders (`backend/venv/`, `frontend/node_modules/`, `frontend/dist/`, `frontend/.vite/`, `*.tsbuildinfo`) are omitted below — everything else in the repo is listed.

```
Sales Intelligence Agent/
├── backend/
│   ├── app/
│   │   ├── main.py                        FastAPI app, CORS, router registration
│   │   ├── common/
│   │   │   └── __init__.py                Empty placeholder package
│   │   ├── controllers/
│   │   │   ├── companies.py
│   │   │   ├── icp.py
│   │   │   ├── icp_imports.py
│   │   │   ├── organisations.py
│   │   │   ├── scores.py
│   │   │   ├── signals.py
│   │   │   ├── triggers.py
│   │   │   ├── users.py
│   │   │   ├── workspaces.py
│   │   │   └── zoominfo_enrich.py
│   │   ├── core/
│   │   │   ├── config.py                  Env-driven Settings
│   │   │   └── db.py                      Async engine/session, Base, get_db()
│   │   ├── models/
│   │   │   ├── company.py
│   │   │   ├── company_intent.py
│   │   │   ├── company_news.py
│   │   │   ├── company_scoop.py
│   │   │   ├── decision_maker.py
│   │   │   ├── icp_profile.py
│   │   │   ├── lead_score.py
│   │   │   ├── organisation.py
│   │   │   ├── signal.py
│   │   │   ├── trigger_definition.py
│   │   │   ├── trigger_event.py
│   │   │   ├── user.py
│   │   │   ├── workspace.py
│   │   │   └── workspace_member.py
│   │   ├── routes/
│   │   │   ├── companies.py
│   │   │   ├── icp.py
│   │   │   ├── icp_imports.py
│   │   │   ├── organisations.py
│   │   │   ├── scores.py
│   │   │   ├── signals.py
│   │   │   ├── triggers.py
│   │   │   ├── users.py
│   │   │   ├── workspaces.py
│   │   │   └── zoominfo_enrich.py
│   │   ├── schemas/
│   │   │   ├── company.py
│   │   │   ├── icp.py
│   │   │   ├── organisation.py
│   │   │   ├── score.py
│   │   │   ├── signal.py
│   │   │   ├── trigger.py
│   │   │   ├── user.py
│   │   │   └── workspace.py
│   │   └── services/
│   │       ├── company_directory.py
│   │       ├── excel_pipeline.py
│   │       ├── icp_filter.py
│   │       ├── lead_scorer.py
│   │       ├── organisation_service.py
│   │       ├── signal_directory.py
│   │       ├── signal_extractor.py
│   │       ├── signal_scorer.py
│   │       ├── trigger_matcher.py
│   │       ├── user_service.py
│   │       ├── workspace_service.py
│   │       ├── zoominfo_client.py
│   │       ├── zoominfo_enrich.py
│   │       └── zoominfo_mapper.py
│   ├── alembic/
│   │   ├── env.py
│   │   ├── README
│   │   └── versions/
│   │       ├── baf990bcfa89_add_organisation_workspace_user_.py
│   │       ├── 444cdbe2a9d3_create_initial_schema.py
│   │       ├── 5c8e6dc1b32b_add_signal_and_lead_score_tables.py
│   │       ├── 4e41097fa3da_add_trigger_definition_and_trigger_.py
│   │       ├── 61a068921d3b_scope_decision_maker_to_organisation_.py
│   │       └── 25c846fecbbe_add_icp_profile_table.py
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── .env                                Local environment config (gitignored)
│   └── Software_PA_Firms_With_ZI_Data.xlsx  Sample ZoomInfo-shaped data file
│
└── frontend/
    ├── src/
    │   ├── main.tsx                        React root / createRoot entry point
    │   ├── App.tsx                         react-router route table
    │   ├── index.css                       Tailwind entry + global styles
    │   ├── vite-env.d.ts
    │   ├── api/
    │   │   ├── client.ts                   Shared fetch wrapper, ApiError, VITE_API_BASE_URL
    │   │   ├── companies.ts
    │   │   ├── icp.ts
    │   │   ├── icpImports.ts
    │   │   ├── organisations.ts
    │   │   ├── scores.ts
    │   │   ├── signals.ts
    │   │   ├── triggers.ts
    │   │   ├── users.ts
    │   │   ├── workspaces.ts
    │   │   └── zoominfoEnrich.ts
    │   ├── components/
    │   │   ├── brand/
    │   │   │   └── Logo.tsx
    │   │   ├── layout/
    │   │   │   ├── PageTransition.tsx
    │   │   │   ├── Sidebar.tsx
    │   │   │   ├── TopActions.tsx
    │   │   │   └── TopBar.tsx
    │   │   └── ui/
    │   │       ├── Button.tsx
    │   │       ├── Checkbox.tsx
    │   │       ├── Input.tsx
    │   │       └── dataviz.tsx             Sparkline, Donut, Delta, UpTriangle (inline SVG charts)
    │   ├── features/
    │   │   ├── auth/
    │   │   │   └── LoginPage.tsx           Login + Forgot Password + MFA (mode-switched)
    │   │   ├── onboarding/
    │   │   │   └── OnboardingPage.tsx
    │   │   ├── dashboard/
    │   │   │   ├── DashboardPage.tsx
    │   │   │   └── LeadGlobe.tsx           Lazy-loaded react-globe.gl globe
    │   │   ├── signal-intelligence/
    │   │   │   ├── SignalIntelligencePage.tsx
    │   │   │   ├── SignalFeedPage.tsx
    │   │   │   ├── SignalDetailPage.tsx
    │   │   │   └── SignalAnalyticsPage.tsx
    │   │   ├── trigger-intelligence/
    │   │   │   ├── TriggerLibraryPage.tsx
    │   │   │   ├── TriggerDetailPage.tsx
    │   │   │   └── TriggerEditorPage.tsx
    │   │   └── crm-intelligence/
    │   │       ├── EnterpriseListPage.tsx
    │   │       ├── EnterpriseDetailPage.tsx
    │   │       ├── BuyingCommitteePage.tsx
    │   │       ├── MemberDetailPage.tsx
    │   │       ├── ScoreBreakdownPage.tsx
    │   │       └── ScoreHistoryPage.tsx
    │   ├── lib/
    │   │   ├── cn.ts                       clsx + tailwind-merge helper
    │   │   ├── session.ts                  localStorage organisation_id / workspace_id
    │   │   ├── signalCategories.ts         Shared signal-category labels/icons/colors
    │   │   └── triggers.ts                 localStorage trigger persistence
    │   └── assets/
    │       ├── earth.png
    │       ├── figma/
    │       │   ├── login/                  36 SVG vector pieces + 1 PNG (assembled FigmaLogo/hero art)
    │       │   └── onboarding/
    │       │       ├── icons/              7 SVGs (arrow-right, calendar, currency, globe, secure, upload, workspace)
    │       │       └── *.png               go-live-rocket, onboarding-frame, raw-image-1, raw-image-2
    │       └── globe/
    │           ├── countries-110m.json
    │           ├── earth-night.jpg
    │           └── earth-topology.png
    ├── CLAUDE.md                           Frontend conventions reference
    ├── README.md                           Short frontend-only readme (pre-existing)
    ├── index.html
    ├── package.json
    ├── package-lock.json
    ├── eslint.config.js
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    ├── vite.config.js                      Duplicate of vite.config.ts (same content)
    └── .env                                VITE_API_BASE_URL (gitignored)
```

## Quick start

Two terminals, one Postgres database.

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
echo "VITE_API_BASE_URL=http://localhost:8175" > .env
npm run dev
```

Full detail on each side — dependency versions, every environment variable, migration commands — is in the [Backend](#backend) and [Frontend](#frontend) sections below.

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
| python-dotenv | 1.0.1 |
| openpyxl | 3.1.5 |
| python-multipart | 0.0.20 |
| httpx | 0.28.1 |

Python 3.11 (per the committed virtual environment's `pyvenv.cfg`; not pinned anywhere else in the repo).

### Data model

| Model | Table | Relationships |
|---|---|---|
| `Organisation` | `organisation` | Tenant root. Has many `Workspace`, many `User`. |
| `Workspace` | `workspace` | Belongs to `Organisation`. Has many `WorkspaceMember`, `IcpProfile`, `TriggerDefinition`. |
| `User` | `app_user` | Belongs to `Organisation`. |
| `WorkspaceMember` | `workspace_member` | Join table between `Workspace` and `User`, carries a `role`. |
| `Company` | `company` | Belongs to `Organisation`. Has many `DecisionMaker`, `CompanyIntent`, `CompanyNews`, `CompanyScoop`, `Signal`; one `LeadScore`. |
| `DecisionMaker` | `decision_maker` | Belongs to `Organisation` and `Company`. Contact/buying-committee member. |
| `CompanyIntent` | `company_intent` | Belongs to `Company`. ZoomInfo intent topic + signal score. |
| `CompanyNews` | `company_news` | Belongs to `Company`. |
| `CompanyScoop` | `company_scoop` | Belongs to `Company`. |
| `IcpProfile` | `icp_profile` | Belongs to `Workspace`. Ideal Customer Profile filter (industries, employee/revenue range, countries, technologies, buying-committee personas). |
| `TriggerDefinition` | `trigger_definition` | Belongs to `Workspace`. Alert rule matching signal types/categories. |
| `TriggerEvent` | `trigger_event` | Links a `TriggerDefinition`, a `Signal`, and a `Company` — one occurrence of a signal matching a trigger. |
| `Signal` | `signal` | Belongs to `Company` (many per company). Extracted buying-intent signal with confidence scoring. |
| `LeadScore` | `lead_score` | Belongs to `Company`, one-to-one. Gate checks + 7-dimension scoring output. |

Multi-tenancy shape: **Organisation → Workspace → WorkspaceMember ↔ User**; `Company`, `Signal`, and `LeadScore` are organisation-scoped, while `IcpProfile` and `TriggerDefinition` are workspace-scoped.

### Notable services

| Service | Purpose |
|---|---|
| `services/lead_scorer.py` | 5-gate qualification check + 7-dimension weighted scoring algorithm. |
| `services/signal_extractor.py` | Rule-based extraction of buying-intent signals into 6 categories (`ai_seriousness`, `ai_pain_points`, `buying_stage`, `budget_and_capital`, `urgency_and_catalysts`, `competitive_context`). |
| `services/excel_pipeline.py` | Excel (`.xlsx`) import/export via `openpyxl`, including multi-file ingestion and company export with scoring. |
| `services/zoominfo_client.py`, `zoominfo_mapper.py`, `zoominfo_enrich.py` | OAuth client-credentials integration with ZoomInfo's enrichment APIs (companies, contacts, scoops, news, intent, technologies). Flagged in its own docstring as not yet exercised against a live ZoomInfo account. |
| `services/trigger_matcher.py`, `services/icp_filter.py` | Match signals/companies against workspace-defined Triggers and ICPs. |

### API reference

No global path prefix. Base URL in local development: `http://localhost:8175`.

<details>
<summary><strong>Organisations, Workspaces, Users</strong></summary>

| Method | Path |
|---|---|
| `POST` | `/organisations` |
| `GET` | `/organisations/{organisation_id}` |
| `POST` | `/organisations/{organisation_id}/workspaces` |
| `GET` | `/organisations/{organisation_id}/workspaces` |
| `POST` | `/workspaces/{workspace_id}/members` |
| `GET` | `/workspaces/{workspace_id}/members` |
| `POST` | `/organisations/{organisation_id}/users` |

</details>

<details>
<summary><strong>Companies</strong></summary>

| Method | Path |
|---|---|
| `GET` | `/organisations/{organisation_id}/companies` |
| `GET` | `/organisations/{organisation_id}/companies/stats` |
| `GET` | `/organisations/{organisation_id}/companies/export` — returns an `.xlsx` file |
| `GET` | `/organisations/{organisation_id}/companies/{company_id}` |
| `GET` | `/organisations/{organisation_id}/companies/{company_id}/decision-makers` |
| `GET` | `/organisations/{organisation_id}/decision-makers/{decision_maker_id}` |

</details>

<details>
<summary><strong>Signals & Scores</strong></summary>

| Method | Path |
|---|---|
| `POST` | `/organisations/{organisation_id}/signals/extract` |
| `POST` | `/organisations/{organisation_id}/signals/rescore` |
| `GET` | `/organisations/{organisation_id}/signals` |
| `GET` | `/organisations/{organisation_id}/signals/stats` |
| `GET` | `/organisations/{organisation_id}/signals/detail/{signal_id}` |
| `GET` | `/organisations/{organisation_id}/signals/{company_id}` |
| `POST` | `/organisations/{organisation_id}/scores/run` |
| `GET` | `/organisations/{organisation_id}/scores/ranked` |
| `GET` | `/organisations/{organisation_id}/scores/{company_id}` |

</details>

<details>
<summary><strong>ICP & Imports</strong></summary>

| Method | Path |
|---|---|
| `POST` | `/workspaces/{workspace_id}/icp` |
| `GET` | `/workspaces/{workspace_id}/icp` |
| `GET` | `/workspaces/{workspace_id}/icp/{icp_id}/companies` |
| `POST` | `/workspaces/{workspace_id}/icp/{icp_id}/imports/excel` — multipart, accepts multiple files |

</details>

<details>
<summary><strong>Triggers</strong></summary>

| Method | Path |
|---|---|
| `POST` | `/workspaces/{workspace_id}/triggers` |
| `GET` | `/workspaces/{workspace_id}/triggers` |
| `GET` | `/workspaces/{workspace_id}/triggers/{trigger_id}/events` |

</details>

<details>
<summary><strong>ZoomInfo Enrich</strong></summary>

| Method | Path |
|---|---|
| `POST` | `/organisations/{organisation_id}/zoominfo/companies/enrich` |
| `POST` | `/organisations/{organisation_id}/zoominfo/contacts/enrich` |
| `POST` | `/organisations/{organisation_id}/zoominfo/scoops/enrich` |
| `POST` | `/organisations/{organisation_id}/zoominfo/news/enrich` |
| `POST` | `/organisations/{organisation_id}/zoominfo/intent/enrich` |
| `POST` | `/organisations/{organisation_id}/zoominfo/technologies/enrich` |

</details>

### Backend environment variables

`backend/.env` (gitignored):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Async SQLAlchemy URL, e.g. `postgresql+asyncpg://signal_user:password@localhost:5432/signal`. App raises at startup if unset. |
| `APP_ENV` | No | Defaults to `local`. |
| `LOG_LEVEL` | No | Defaults to `INFO`. |
| `ZOOMINFO_CLIENT_ID` | No | Required only to use the ZoomInfo enrichment routes. |
| `ZOOMINFO_CLIENT_SECRET` | No | Required only to use the ZoomInfo enrichment routes. |

For Alembic migrations, `DATABASE_URL` is reused with `+asyncpg` swapped for `+psycopg` (see `database_url_sync` in `core/config.py`), since migrations run over the sync driver.

### Backend setup

```bash
cd backend
python -m venv venv
./venv/Scripts/activate        # Windows; use `source venv/bin/activate` on macOS/Linux
pip install -r requirements.txt

# Create backend/.env with at least DATABASE_URL (see table above)

alembic upgrade head
python -m uvicorn app.main:app --port 8175
```

CORS is configured to allow any `localhost`/`127.0.0.1` origin on any port (`allow_origin_regex`), to accommodate Vite's floating dev-server port.

## Frontend

### Frontend stack

| Package | Version |
|---|---|
| react / react-dom | ^19.0.0 |
| react-router-dom | ^7.18.1 |
| vite | ^6.0.6 |
| tailwindcss / @tailwindcss/vite | ^4.1.11 |
| typescript | ^5.7.2 |
| lucide-react | ^0.468.0 |
| react-globe.gl | ^2.38.0 |
| react-svg-worldmap | ^2.0.2 |
| three | ^0.185.1 |
| clsx / tailwind-merge | ^2.1.1 / ^2.5.5 |

### Routing

Client-side routing via `react-router-dom` (`BrowserRouter`/`Routes`/`Route` in `src/App.tsx`), each route wrapped in `PageTransition` for a fade-in on mount.

| Path | Page |
|---|---|
| `/`, `/forgot-password`, `/mfa-verification` | `LoginPage` (mode switch handled internally) |
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

Sidebar navigation (`components/layout/Sidebar.tsx`) uses `Link` for client-side transitions; most in-page navigation (row clicks, tab links) still uses `window.location.href` (full page reload).

### API client

`src/api/client.ts` provides a shared `fetch` wrapper (`apiGet`/`apiPost`/`apiPostForBlob`/`apiGetForBlob`, plus an `ApiError` type) reading `VITE_API_BASE_URL` (default `http://localhost:8175`). One file per backend resource: `organisations.ts`, `workspaces.ts`, `users.ts`, `companies.ts`, `signals.ts`, `scores.ts`, `icp.ts`, `icpImports.ts`, `triggers.ts`, `zoominfoEnrich.ts`.

### Session state

There is no authentication yet. `src/lib/session.ts` stores the current `organisation_id`/`workspace_id` in `localStorage` once, during onboarding. `src/lib/triggers.ts` similarly persists user-created triggers to `localStorage`.

### Frontend setup

```bash
cd frontend
npm install                     # behind a corporate TLS proxy: NODE_OPTIONS=--use-system-ca npm install
echo "VITE_API_BASE_URL=http://localhost:8175" > .env
npm run dev
```

| Script | Command |
|---|---|
| `npm run dev` | `vite --host 0.0.0.0` |
| `npm run build` | `tsc -b && vite build` |
| `npm run preview` | `vite preview --host 0.0.0.0` |
| `npm run lint` | `eslint .` |

## License

No `LICENSE` file is currently present in this repository.
