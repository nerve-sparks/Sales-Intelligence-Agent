# Handover & KT — Sales Intelligence Agent (XSparks SIGNAL)

Backend → Frontend API handover and project ownership transfer.
Source of truth for behaviour is always the code; this document points you at it.

---

# Part 1 — Backend → Frontend API Handover

## 1.1 Environment & base URLs

| Environment | API base URL | Notes |
|---|---|---|
| Local | `http://localhost:8175` | Default in `frontend/src/api/client.ts` |
| Any | `VITE_API_BASE_URL` | Overrides the default |

- Start backend: `python -m uvicorn app.main:app --port 8175` (from `backend/`, venv active).
- Start frontend: `npm run dev` (from `frontend/`).
- CORS: allows any `http://localhost:<port>` or `http://127.0.0.1:<port>` (regex, not a fixed port — Vite picks whatever is free).
- Static assets (org logos) served at `/static/...`.
- Custom response headers exposed to JS: `Content-Disposition`, `X-Files-Processed`, `X-Total-Rows`, `X-Companies-Ingested`, `X-Signals-Extracted`, `X-Sales-Ready-Count`, `X-High-Priority-Count`, `X-Warm-Count`, `X-Monitor-Count`, `X-Low-Priority-Count`.

### Required frontend env vars (`frontend/.env`)

`VITE_API_BASE_URL`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`

### Required backend env vars (`backend/.env`)

| Variable | Required | Default |
|---|---|---|
| `DATABASE_URL` | **Yes** | — (raises on startup if unset) |
| `FIREBASE_CREDENTIALS_PATH` | Yes for auth | `None` |
| `YOU_API_KEY` | Yes for research | `None` |
| `LLM_API_KEY` | Yes for extraction | `None` |
| `SCRAPER_SERVICE_URL`, `SCRAPER_API_KEY` | Optional | `None` (falls back to static offering profile) |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` | Optional | tracing no-ops without them |
| `RESEARCH_CONCURRENCY` | Optional | `10` |
| `DB_POOL_SIZE`, `DB_MAX_OVERFLOW` | Optional | `max(RESEARCH_CONCURRENCY, 5) + 5` |
| `APP_ENV`, `LOG_LEVEL` | Optional | `local`, `INFO` |
| `TAVILY_API_KEY`, `DEEPSEEK_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Unused by active pipeline | — |

---

## 1.2 Authentication, headers & permissions

**Scheme:** Firebase ID token as a bearer token. There is no backend-issued session or refresh token.

```
Authorization: Bearer <firebase_id_token>
Content-Type: application/json          # JSON requests only, omit for multipart
```

The frontend attaches this automatically in `frontend/src/api/client.ts` via `auth.currentUser.getIdToken()`. If no Firebase user is signed in, no header is sent and the call will 401.

**Three permission levels** (`backend/app/core/auth.py`):

| Dependency | Proves | Used on |
|---|---|---|
| `require_firebase_user` | Someone is logged in | Tenant creation (`POST /organisations`, `/users`, `/workspaces`, `/workspaces/{id}/members`), `/uploads/logo`, `/auth/me` |
| `require_organisation_member` | Caller's `app_user` row belongs to `{organisation_id}` in the path | companies, signals, scores, organisations GET/PUT |
| `require_workspace_member` | Caller has a `workspace_member` row for `{workspace_id}` | imports |

Tenant scoping is enforced from the path parameter, so a valid login cannot read another organisation's data by guessing its UUID.

**Client-side session** — `localStorage`, keys `xsparks_organisation_id` and `xsparks_workspace_id` (`frontend/src/lib/session.ts`). Populated at onboarding or from `GET /auth/me`; cleared on logout. Firebase manages its own token persistence separately.

---

## 1.3 Endpoint reference

`{oid}` = `organisation_id`, `{wid}` = `workspace_id`. Auth column: **F** = logged in, **O** = org member, **W** = workspace member.

### Auth & tenancy

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/auth/me` | F | Resolve token → `{has_account, organisation_id, workspace_id}`. Call first after login. |
| POST | `/organisations` | F | Create organisation (onboarding step 1) |
| GET | `/organisations/{oid}` | O | Fetch organisation profile |
| PUT | `/organisations/{oid}` | O | Update profile (partial, `exclude_unset`) |
| POST | `/organisations/{oid}/offering-profile/sync` | O | Re-sync offering profile from website |
| POST | `/organisations/{oid}/users` | F | Create app user (onboarding step 2) |
| PUT | `/organisations/{oid}/users/{user_id}` | F | Update own `full_name` / `designation` |
| POST | `/organisations/{oid}/workspaces` | F | Create workspace (onboarding step 3) |
| GET | `/organisations/{oid}/workspaces` | O | List workspaces (top-bar switcher) |
| POST | `/workspaces/{wid}/members` | F | Add self as member (onboarding step 4) |
| GET | `/workspaces/{wid}/members` | W | List members |
| POST | `/uploads/logo` | F | Upload org logo, returns `{url}` |

### Companies

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/organisations/{oid}/companies` | O | Paginated company list with score fields |
| GET | `/organisations/{oid}/companies/stats` | O | Dashboard counts, `by_country`, `by_sector` |
| GET | `/organisations/{oid}/companies/insight` | O | LLM narrative summary `{summary}` |
| GET | `/organisations/{oid}/companies/export` | O | XLSX download (`Response`, not JSON) |
| GET | `/organisations/{oid}/companies/{company_id}` | O | Company + eager-loaded decision makers |
| GET | `/organisations/{oid}/companies/{company_id}/decision-makers` | O | Contacts for a company |
| GET | `/organisations/{oid}/decision-makers/{decision_maker_id}` | O | Single contact |

### Signals (buying events)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/organisations/{oid}/signals` | O | Paginated, filterable signal feed |
| GET | `/organisations/{oid}/signals/stats` | O | Analytics: tiers, categories, trend, histogram, geo |
| GET | `/organisations/{oid}/signals/detail/{signal_id}` | O | One signal + company |
| GET | `/organisations/{oid}/signals/{company_id}` | O | All signals for a company |
| POST | `/organisations/{oid}/signals/extract` | O | **Legacy/inert** — always `{inserted:0, skipped:0}` |
| POST | `/organisations/{oid}/signals/rescore` | O | **Legacy/inert** |

### Scores

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/organisations/{oid}/scores/run` | O | Re-score synchronously; returns band counts |
| GET | `/organisations/{oid}/scores/ranked` | O | Full ranked list (no pagination) |
| GET | `/organisations/{oid}/scores/{company_id}` | O | Score detail + evidence events |

### Imports / jobs

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/workspaces/{wid}/imports/excel` | W | Upload CSV/XLSX; ingests then schedules background research + scoring |
| GET | `/workspaces/{wid}/imports` | W | Upload history, newest first (no pagination) |
| GET | `/workspaces/{wid}/imports/{import_batch_id}` | W | Job status rollup — **poll this** |
| GET | `/workspaces/{wid}/imports/{import_batch_id}/items` | W | Per-company status, paginated |
| POST | `/workspaces/{wid}/imports/{import_batch_id}/retry-failed` | W | Re-queue only `failed` companies |
| POST | `/workspaces/{wid}/imports/{import_batch_id}/cancel` | W | Cooperative cancel |
| DELETE | `/workspaces/{wid}/imports/{import_batch_id}` | W | **Destructive** — removes batch + companies unique to it |

---

## 1.4 Mandatory vs optional fields & validation

**All request bodies are JSON. Every field not listed as required is optional and nullable.**

| Endpoint | Required | Optional |
|---|---|---|
| `POST /organisations` | `company_name` | `account_name`, `account_url`, `account_logo_url`, `timezone`, `currency`, `website`, `legal_business_name`, `industry`, `sub_industry`, `headquarters_location`, `founded_year`, `employee_count_range`, `annual_revenue_range`, `business_type`, `company_description` |
| `PUT /organisations/{oid}` | — | `company_name`, `website`, `legal_business_name`, `industry`, `headquarters_location`, `company_description`, `account_logo_url` |
| `POST .../users` | `email` | `full_name`, `designation` — server overwrites `email` with the token's email |
| `PUT .../users/{id}` | — | `full_name`, `designation` |
| `POST .../workspaces` | `workspace_name` | `purpose` |
| `POST /workspaces/{wid}/members` | `user_id` | `role` (default `"member"`) |
| `POST .../imports/excel` | `files` (multipart, repeatable) | — |
| `POST /uploads/logo` | `file` (multipart) | — |

**Explicit validation in code**

| Rule | Where | Failure |
|---|---|---|
| Logo MIME must be `image/png`, `image/jpeg`, `image/svg+xml` | `uploads.py` | `400 "logo must be a PNG, JPG, or SVG image"` |
| Logo ≤ 2 MB | `uploads.py` | `400 "logo must be 2MB or smaller"` |
| `page_size` capped | companies 100, signals 100, job items 200 | Silently clamped, **no error** |
| Invalid `sort` value | `signals` | Silently falls back to `date` |
| Invalid `status` / `sector` filter | signals, job items | Returns empty result set, **no error** |
| Missing/invalid body field | FastAPI/Pydantic | `422` with FastAPI's error array |

> Request bodies are declared inline in `backend/app/controllers/`, not in `app/schemas/`. Everything in `app/schemas/` is a **response** model.

---

## 1.5 Success & error responses

### Success codes

All endpoints return **200** on success (including `POST` creates — no `201` is used anywhere). `/companies/export` returns 200 with an XLSX body and `Content-Disposition: attachment; filename="companies_export.xlsx"`.

### Error shape

FastAPI standard:

```json
{ "detail": "company not found" }
```

`422` returns an array of field errors instead of a string. The frontend normalises both into `ApiError { status, detail, message }` (`frontend/src/api/client.ts`).

### Status codes in use

| Code | When | Example detail |
|---|---|---|
| 200 | Success | — |
| 400 | Upload validation | `"logo must be 2MB or smaller"` |
| 401 | Missing/invalid token | `"Missing or invalid Authorization header"`, `"Invalid or expired token"` |
| 403 | Wrong tenant | `"Not authorized for this organisation"`, `"Not authorized for this workspace"`, `"Not authorized to edit this user"`, `"Not authorized to add this member"`, `"This organisation already has an owner"` |
| 404 | Missing resource | `"company not found"`, `"decision maker not found"`, `"signal not found"`, `"organisation not found"`, `"user not found"`, `"workspace not found"`, `"import batch not found"` |
| 409 | Duplicate user | `"A user with this email already exists."` |
| 422 | Body/param validation | FastAPI error array |
| 500 | Firebase misconfigured | `"FIREBASE_CREDENTIALS_PATH is not set in the environment"` |

### Two non-obvious cases the frontend must handle

1. **`GET /scores/{company_id}` returns 200, not 404, when a company is unscored** — body is `{"detail": "not scored yet"}`. Check for the `detail` key, not the status.
2. **`POST /offering-profile/sync` never fails** — returns 200 with `status` of `"synced"`, `"sync_failed"` or `"fallback"`. Read `status`, don't rely on the HTTP code.

---

## 1.6 Pagination, filtering & sorting

### Pagination

| Endpoint | Params | Default | Max |
|---|---|---|---|
| `GET .../companies` | `page`, `page_size` | 1, 25 | 100 |
| `GET .../signals` | `page`, `page_size` | 1, 25 | 100 |
| `GET .../imports/{id}/items` | `page`, `page_size` | 1, 50 | 200 |

Envelope is identical everywhere:

```json
{ "items": [], "total": 0, "page": 1, "page_size": 25 }
```

**Not paginated:** `/scores/ranked`, `/imports`, `/workspaces`, `/members`, `/signals/{company_id}`, `/companies/{id}/decision-makers`.

### Filtering

| Param | Endpoints | Accepted values |
|---|---|---|
| `import_batch_id` | companies, companies/stats, companies/export, signals, signals/stats, scores/run, scores/ranked | UUID |
| `search` | companies | Free text, case-insensitive substring on company name |
| `sector` | companies/stats, signals | `Technology`, `Industrials`, `Financial Services`, `Healthcare`, `Consumer`, `Energy & Resources`, `Business Services`, `Real Estate`, `Education`, `Diversified`, `Unclassified` |
| `category` | signals | `buying_stage`, `ai_seriousness`, `ai_pain_points`, `budget_and_capital`, `urgency_and_catalysts`, `competitive_context`, `company_identity`, `reachability` |
| `event_type` | signals | Dynamic (see `BASE_STRENGTH` keys in `scoring_config.py`) |
| `min_score` | signals | Float, `event_score >= min_score` |
| `days` | signals | Int, requires non-null `published_at` |
| `status` | imports/items | `queued`, `researching`, `scoring`, `completed`, `retrying`, `failed`, `needs_review` |

### Sorting

- `GET .../signals` — `sort` param: `date` (default, newest first), `oldest`, `score`, `company`. Future-dated events are pushed to the end of `date` sort.
- `GET .../scores/ranked` — fixed server-side: `lead_score DESC → evidence_confidence DESC → scored_at DESC → company_name ASC`.
- `GET .../imports` — fixed, newest first.

---

## 1.7 API dependencies & execution sequence

### Onboarding — strict order, each step needs the previous ID

```
Firebase sign-up
  → GET  /auth/me                                  (has_account: false)
  → POST /organisations                            → organisation_id
  → POST /organisations/{oid}/users                → user_id
  → POST /organisations/{oid}/workspaces           → workspace_id
  → POST /workspaces/{wid}/members  {user_id}
  → store organisation_id + workspace_id in localStorage
```

Skipping a step 403s the next one. Only the first user of an organisation may create a workspace (`"This organisation already has an owner"`).

### Data ingestion — asynchronous, must be polled

```
POST /workspaces/{wid}/imports/excel
  → 200 with ImportBatchOut (scoring_status: "pending")   [ingest is synchronous]
  → BackgroundTask: research → firmographic enrichment → scoring
  → poll GET /workspaces/{wid}/imports/{import_batch_id}
       until status ∈ {completed, partially_completed, failed, cancelled}
  → then companies/stats, scores/ranked and signals return populated data
```

The frontend polls every 3 s while a job is `queued` or `processing`. **There are no websockets or SSE.**

Notes:
- A batch interrupted by a backend restart is *not* resumed. `job_recovery.stop_interrupted_jobs()` marks it stopped/retryable on startup; the user must call `retry-failed`.
- `cancel` only sets `cancel_requested_at`; the background task checks it cooperatively, so cancellation is not instant.
- `retry-failed` re-queues only `failed` companies — not `needs_review` or `completed`.

### Page load sequence (typical)

```
GET /auth/me → read localStorage ids → page-specific calls in parallel
Dashboard:      companies/stats, signals/stats, scores/ranked, signals, imports
Enterprise List: companies/stats, companies, imports
Signal Feed:    signals, companies/stats (for the sector dropdown)
```

---

## 1.8 API documentation & collections

**No Postman collection is committed.** FastAPI auto-generates live docs — use these instead:

| Resource | URL |
|---|---|
| Swagger UI | `http://localhost:8175/docs` |
| ReDoc | `http://localhost:8175/redoc` |
| OpenAPI JSON | `http://localhost:8175/openapi.json` |

To produce a Postman collection: import `openapi.json` directly (Postman → Import → Link). This stays accurate automatically, which a hand-maintained collection would not.

---

## 1.9 Known issues, limitations & pending changes

### Documentation drift

- **`README.md` still names Tavily as the research provider.** The active provider is **you.com** (`you_client.py`, `YOU_API_KEY`). `tavily_client.py` is retained but not imported by the pipeline. Several code comments and one UI string ("researched live via Tavily" on the Signal Feed) also still say Tavily.

### Incomplete features

- **Score History page** (`/score-history`) renders hardcoded sample data for "Acme Corporation" — no API wiring, no backend endpoint. Either build it or hide the route.
- **`POST /signals/extract` and `POST /signals/rescore`** are inert legacy endpoints that always return zeros. Do not call.

### API limitations to design around

- `GET /scores/ranked` returns **every** scored company with no pagination — will grow unbounded with company count.
- `GET /companies/stats` `sector` filter applies to `by_country` **only**; `by_sector` is always the unfiltered breakdown.
- `POST /scores/run` is **synchronous** — a large re-score will block the request until finished.
- Invalid filter values fail silently (empty list) rather than returning 422, so a typo in a filter looks like "no data".
- No rate limiting, no request idempotency keys, no API versioning (`/v1`) on any route.
- `POST /uploads/logo` validates by client-supplied `Content-Type` only, not by file magic bytes.

### Security / correctness items worth reviewing

- The `users` router has **no router-level auth dependency**; both handlers rely on handler-level `require_firebase_user` plus an in-body ownership check. Functional, but inconsistent with every other router and easy to break when adding a route.
- `POST /organisations` is callable by any authenticated Firebase user with no invite or allow-list.
- Uploaded logos are written to local disk under `backend/static/` — not object storage, so they do not survive a container rebuild and won't work across multiple instances.

### Operational

- **No Dockerfile or docker-compose.** Deployment is manual: venv + uvicorn + `alembic upgrade head`.
- **No frontend test suite** (no Vitest/Jest/Playwright).
- Background jobs run **in-process** via FastAPI `BackgroundTasks` — no Celery/RQ. Horizontal scaling would need real queueing, and any restart interrupts running jobs.
- Langfuse timeouts appear in logs during heavy research runs; they are non-fatal and do not affect scoring.

---

# Part 2 — Project Ownership Transfer / KT

## 2.1 Project overview & business flow

**Problem.** Sales teams have long lists of companies and no reliable way to know which are actually in a buying cycle right now.

**What the product does.** It turns a spreadsheet of companies into a ranked, evidence-backed call list. Every company's position is justified by real published evidence with a link back to the source article. Nothing is fabricated; unverifiable fields are left empty rather than guessed.

**Business flow**

1. **Upload** — user uploads CSV/XLSX of prospects. ZoomInfo exports and arbitrary sheets both work; headers are matched by meaning (`table_mapper.py`), all sheets are read, and the header row is detected even below a title row.
2. **Research** — each company is searched on the live web via you.com for buying events (funding, hiring, leadership changes, M&A, expansion, tech mandates, procurement, compliance pressure, operational problems).
3. **Extract** — an LLM classifies each article into a typed event with relevance, confidence, status and source quality. Articles about the same real-world event are merged into one canonical event.
4. **Enrich** — missing firmographics (industry, HQ, headcount, revenue, founded, ownership, funding) are filled from the same research. Uploaded values are never overwritten.
5. **Score** — events → event scores → Buying Evidence; contacts → Contact Access; negative findings → penalty. Combined into a 0–100 Lead Score and a Sales Status band.
6. **Work the list** — Dashboard for priorities, Enterprise List top-down, Signal Feed for newest evidence, Score Breakdown for the audit trail.

**The scoring model** (`backend/app/core/scoring_config.py` is the single source of truth):

```
Lead Score = clamp(Buying Evidence + Contact Access − Negative Evidence, 0, 100)

Event Score      = Base Strength × Relevance × Freshness × Source Quality
                   × Extraction Confidence × Status
Buying Evidence  = min(80, e₁×1.00 + e₂×0.60 + e₃×0.40)   # top 3 independent events
Contact Access   = 0–20, from the single strongest reachable contact only
Sales Status     = Sales Ready 65+ | High Priority 50+ | Warm 35+ | Monitor 20+ | Low Priority 0+
```

Deliberate design decisions, do not "fix" without discussion:
- Revenue, headcount and funding are **absent** from Lead Score — they only set Expected Deal Value.
- There is **no ICP gate**. Every uploaded company is scored and displayed.
- Only the top three events count, so press-coverage volume cannot inflate a score.
- Confidence is computed independently of the score, so a low score never implies uncertainty.

The in-app **Platform Guide** (top bar, `frontend/src/components/guide/PlatformGuide.tsx`) documents all of this for end users and mirrors `scoring_config.py`. **If you change scoring constants, update that file too.**

## 2.2 System architecture & major components

```
┌─────────────────────┐      Bearer Firebase ID token      ┌──────────────────────┐
│  React 19 + Vite    │ ─────────────────────────────────► │  FastAPI  :8175      │
│  TS + Tailwind      │                                    │  routes → controllers│
│  Firebase Client    │ ◄───── JSON / XLSX ──────────────── │        → services    │
└─────────┬───────────┘                                    └───┬──────────┬───────┘
          │ VITE_FIREBASE_*                                    │          │
          ▼                                                    ▼          ▼
   ┌──────────────┐                                   ┌────────────┐  ┌─────────────┐
   │  Firebase    │◄── verify token ──────────────────│ PostgreSQL │  │ you.com     │
   │  Auth        │                                   │ SQLAlchemy │  │ BridgeLLM   │
   └──────────────┘                                   │  asyncpg   │  │ Nexus Scrpr │
                                                      └────────────┘  │ Langfuse    │
                                                                      └─────────────┘
```

**Backend layering** — keep to it:

| Layer | Responsibility |
|---|---|
| `routes/` | Path + method + response model + auth dependency only. No logic. |
| `controllers/` | Request handling, param defaults, HTTP errors, request-body schemas |
| `services/` | All business logic, DB queries, external calls |
| `models/` | SQLAlchemy ORM |
| `schemas/` | Pydantic **response** models |
| `core/` | Config, DB engine, auth, scoring constants, logging |

**Key services**

| Service | Role |
|---|---|
| `excel_pipeline.py` | Orchestrates ingest → research → enrichment → scoring; background task entry point |
| `table_mapper.py` | Header-agnostic spreadsheet → canonical fields |
| `zoominfo_mapper.py` | ZoomInfo-specific export path |
| `search_signal_ingest.py` | Concurrent web research (`RESEARCH_CONCURRENCY`) |
| `buying_event_service.py` | Event extraction, dedup/canonicalisation, per-event scoring |
| `evidence_scorer.py` | Company-level scoring: evidence, contact access, penalty, confidence, deal value |
| `company_enrichment.py` | Firmographic + domain enrichment from search results |
| `company_directory.py`, `buying_event_directory.py`, `signal_directory.py` | Read-side queries and aggregations |
| `company_batch_status.py`, `job_recovery.py` | Per-company job status; restart recovery |
| `offering_profile_service.py` | Scrape + structure what XSparks sells (drives relevance) |
| `llm_client.py`, `you_client.py`, `nexus_scraper.py`, `firebase_client.py`, `langfuse_cost.py` | External clients |

**Frontend structure** — feature-first: `features/<area>/<Page>.tsx`, shared `components/`, typed API wrappers in `api/`, cross-cutting state in `lib/`. Routing is a flat list in `App.tsx` wrapped by `RequireAuth` → `RequireOnboarding`.

## 2.3 Repository structure

```
Sales Intelligence Agent/
├── README.md                     # setup (note: Tavily reference is stale)
├── HANDOVER.md                   # this file
├── backend/
│   ├── alembic/versions/         # 24 migrations, linear chain
│   ├── alembic.ini
│   ├── pytest.ini                # asyncio_mode = auto
│   ├── requirements.txt
│   ├── static/logos/             # uploaded org logos (local disk)
│   ├── tests/                    # ~95 pytest tests + standalone scorer script
│   └── app/
│       ├── main.py               # app, CORS, routers, lifespan
│       ├── core/                 # config, db, auth, scoring_config, industry_sectors
│       ├── models/               # 18 SQLAlchemy models
│       ├── schemas/              # Pydantic response models
│       ├── routes/               # path + method + auth dependency per resource
│       ├── controllers/          # request handling, 31 documented endpoints
│       └── services/             # 25 service modules
└── frontend/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── App.tsx               # route table
        ├── api/                  # one typed module per backend resource
        ├── components/           # layout, ui, guide, auth guards, brand
        ├── features/             # auth, onboarding, dashboard, signal-intelligence,
        │                         # crm-intelligence, settings
        └── lib/                  # firebase, session, useAuth, CurrentUserContext, cn
```

## 2.4 Database & important schemas

**PostgreSQL** via SQLAlchemy async (`asyncpg`). Alembic for migrations, single linear chain, head is **`d1a7f3c8e5b2` (cascade_company_deletes)**.

```bash
cd backend && alembic upgrade head        # apply
alembic revision --autogenerate -m "..."  # new migration
```

`alembic/env.py` converts `+asyncpg` → `+psycopg` for the sync migration driver, so `DATABASE_URL` needs no change between app and migrations.

### Tenancy chain

```
Organisation ─┬─< User
              ├─< Workspace ─┬─< WorkspaceMember >── User
              │              └─< IcpImportBatch ─< CompanyImportBatch
              └─< Company ─┬─< DecisionMaker
                           ├─< BuyingEvent
                           ├─< LeadScore (1:1)
                           └─< CompanyImportBatch
```

### Core tables

| Table | Purpose | Notes |
|---|---|---|
| `organisation` | Tenant root | Holds `offering_profile` (JSONB) that drives relevance scoring |
| `app_user` | User | Unique `email`, unique `firebase_uid` — the token→user join |
| `workspace`, `workspace_member` | Department-level book of business | Unique `(workspace_id, user_id)` |
| `company` | Prospect company + firmographics | Unique `(organisation_id, zi_company_id)`; `primary_industry`/`industries` are `TEXT[]`; `search_signals_fetched_at` marks "researched" |
| `decision_maker` | Contacts | Unique `(organisation_id, zi_person_id)`; `persona` CHECK with 27 values |
| `buying_event` | **The evidence table** | Unique `(company_id, canonical_key)` = dedup guarantee; `evidence` JSONB holds source list; carries all six score multipliers |
| `lead_score` | Scoring output, 1 row per company | Active columns are `buying_evidence_score`, `contact_access_score`, `negative_event_score`, `lead_score`, `sales_status`, `confidence_label`, deal-value fields, `evidence_summary` JSONB |
| `icp_import_batch` | One upload = one job | `import_batch_id` doubles as `job_id`; carries `research_status`, `scoring_status`, band counts, `processing_warnings` JSONB, `cancel_requested_at` |
| `company_import_batch` | Per-company job status | `status` CHECK: queued/researching/scoring/completed/retrying/failed/needs_review; `retry_count`; lets a company belong to several uploads |

### Legacy tables — data retained, not written by the active pipeline

`signal`, `icp_profile`, `company_intent`, `company_news`, `company_scoop`, `signal_extraction_check`, and the `gate_check_*` / `d1_*`–`d7_*` / `p_convert` columns on `lead_score` (explicitly NULLed by the current scorer).

### Cascade behaviour

Most FKs are `ON DELETE CASCADE`; deleting an organisation removes its whole tree. `company.import_batch_id` is `SET NULL`. Migration `d1a7f3c8e5b2` added cascade to `lead_score.company_id` and `signal.company_id`, which is what makes upload deletion safe. `delete_import_batch` keeps companies that also belong to another upload.

## 2.5 APIs & third-party integrations

| Service | Purpose | Endpoint | Credential | If unavailable |
|---|---|---|---|---|
| **Firebase Auth** | Sign-in; ID token verification | Admin SDK | `FIREBASE_CREDENTIALS_PATH` (backend), `VITE_FIREBASE_*` (frontend) | All authenticated routes fail. Hard dependency. |
| **you.com Search** | Live web research — the evidence source | `GET https://api.you.com/v1/search`, header `X-API-Key` | `YOU_API_KEY` | Research returns `search_not_configured`, zero events. No auto-fallback to Tavily. |
| **BridgeLLM** (LiteLLM proxy) | Event extraction/classification, insights, offering profile | `https://llm.bridgellm.nervesparks.com`, model `gemini-flash-latest`, 45 s timeout, no retries | `LLM_API_KEY` | Callers degrade to rule-based/empty results. **No runtime fallback provider** despite DeepSeek/Ollama factories existing in `llm_client.py`. |
| **Nexus Scraper** | Scrapes `xsparks.ai` for the offering profile | `POST {SCRAPER_SERVICE_URL}/public/scrape` (+ batch/result), header `X-API-Key` | `SCRAPER_SERVICE_URL`, `SCRAPER_API_KEY` | Falls back to static `XSPARKS_FALLBACK_PROFILE`; never blocks onboarding. |
| **Langfuse** | LLM tracing and USD cost attribution | `{LANGFUSE_HOST}/api/public/models` + SDK | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` | Tracing no-ops. Timeouts are logged and harmless. |
| **Tavily** | Former research provider | `POST https://api.tavily.com/search` | `TAVILY_API_KEY` | **Not called by active code.** |

## 2.6 Local setup & tests

```bash
# Backend
cd backend
python -m venv venv
./venv/Scripts/activate      # Windows; source venv/bin/activate on macOS/Linux
pip install -r requirements.txt
# create backend/.env (see 1.1), then:
alembic upgrade head
python -m uvicorn app.main:app --port 8175

# Frontend
cd frontend
npm install
# create frontend/.env (see 1.1), then:
npm run dev
```

**Tests** (from `backend/`, needs a real Postgres at `DATABASE_URL` — integration tests do not mock the DB):

```bash
pytest                                  # ~95 tests
python tests/test_evidence_scorer.py    # standalone scoring invariants, no DB
```

Coverage: full pipeline integration, job tracking and crash recovery, import deletion, event extraction/dedup, company enrichment, table mapping, Langfuse cost, scoring invariants. External services are monkeypatched only in outage-simulation tests.

**Type-check / lint frontend:**

```bash
cd frontend && npx tsc -b && npm run lint
```

## 2.7 First tasks for the new owner

1. Read `backend/app/core/scoring_config.py` end to end — the comments explain *why* each constant is what it is, and it is the heart of the product.
2. Follow one upload through `excel_pipeline.score_companies_in_background` to see the full pipeline.
3. Import `openapi.json` into Postman and save a shared collection.
4. Containerise (Dockerfile + compose) and move background jobs to a real queue before scaling beyond one instance.
5. Build **lead generation** — the main new feature. See Part 3.

---

# Part 3 — Pending Work: Lead Generation (new feature)

## 3.1 What changes

**Today** the platform only *scores* leads. Companies must already exist in a spreadsheet the user uploads; the system researches and ranks them but never discovers anyone new.

**Next** the platform must also *generate* leads. The user describes their ideal customer profile on an ICP page, an LLM proposes matching companies, those companies are researched on the web, scored through the existing engine, and delivered as an Excel sheet.

```
ICP page (user defines target profile)
      ↓
LLM generates candidate companies  ← NEW
      ↓
Verify each candidate really exists + resolve its domain  ← NEW
      ↓
you.com research for buying events        ┐
Firmographic enrichment                   │  existing pipeline,
Evidence scoring → Lead Score + Status    │  reusable as-is
Excel sheet generated                     ┘
```

The end state is two ways in — **upload** an existing list, or **generate** a new one — converging on the same research, scoring and export path.

## 3.2 What already exists and should be reused

Most of this feature is plumbing between components that are already built and tested. Do not rebuild these.

| Need | Reuse | Notes |
|---|---|---|
| ICP storage | **`IcpProfile` model / `icp_profile` table** | Already workspace-scoped with exactly the right fields: `industries`, `employee_min/max`, `revenue_min_usd/max_usd`, `countries`, `technologies`, `buying_committee_personas`, `departments`. Currently marked legacy and never read. **Revive it — do not create a second table.** `fit_mode` belongs to the removed gate scorer and can be ignored. |
| Company identity for generated rows | **`table_mapper.synthetic_bigint()`** + **`zoominfo_mapper.company_uuid()`** | `company.zi_company_id` is `BIGINT NOT NULL` and half of the unique key `(organisation_id, zi_company_id)`. Generated companies have no ZoomInfo ID, exactly like plain-CSV uploads, which already solve this by hashing domain (else normalised name) into a stable BIGINT. Same call, same guarantees — re-generating the same company updates rather than duplicates. |
| Domain resolution / verification | **`company_enrichment.py`** | Already resolves a company's real domain from search results, with 19 tests including negative cases for wrong domains. This is the natural verification step. |
| Research | **`search_signal_ingest.research_companies()`** | Operates on company rows already in the DB, not on spreadsheet input, so it works unchanged on generated companies. |
| Firmographics | **`company_enrichment.enrich_missing_firmographics()`** | Generated leads arrive with almost no firmographics, so this matters more here than on upload. |
| Scoring | **`evidence_scorer.py`** | No change needed. |
| Whole second half of the pipeline | **`excel_pipeline.score_companies_in_background()`** | Research → enrichment → scoring, already orchestrated, chunked and committed. A generation run should hand off to this rather than reimplement it. |
| Progress, retry, cancel | **`icp_import_batch` + `company_import_batch`** | Model a generation run as a batch and per-company job tracking, polling, `retry-failed` and `cancel` all come free. **`icp_import_batch.icp_id` FK already exists** (SET NULL) — use it to link a run back to the ICP that produced it. |
| Excel output | **`excel_pipeline.build_export_workbook()` / `EXPORT_COLUMNS`**, exposed at `GET /organisations/{oid}/companies/export?import_batch_id=...` | "An Excel sheet will be generated" is **already done**. Point the export at the generation batch; no new export code required. |
| LLM calls | **`llm_client.complete()`** | Already wrapped in Langfuse tracing and cost attribution. |
| "What we sell" context | **`organisation.offering_profile`** | Feed this into the generation prompt so proposed companies are relevant, the same profile that drives relevance scoring. |

## 3.3 What has to be built

1. **ICP page (frontend).** A form writing to `icp_profile`. Note the existing `SettingsIcpDataPage` is *offering and prospect data* despite its name — it contains no ICP form. This is new UI.
2. **ICP CRUD API.** There are currently **no** ICP-profile endpoints; `routes/icp_imports.py` handles uploads only. Add workspace-scoped create/read/update under `require_workspace_member`.
3. **Lead generation service.** The genuinely new component: turn an `IcpProfile` into a list of candidate companies via the LLM. Needs a prompt design, a target count, and batching so one call is not asked for hundreds of names at once.
4. **Candidate verification.** Confirm each proposed company is real and resolve its domain *before* writing a `company` row.
5. **Deduplication against the existing book.** Skip candidates already in the organisation, by resolved domain, so generation does not re-add uploaded companies.
6. **Provenance.** A way to tell generated companies from uploaded ones — a source field on the batch and/or company. Needed for auditability, for labelling in the UI, and to keep the two populations comparable.
7. **Generation-run endpoint.** Start a run from an ICP, returning a batch id the frontend polls with the existing job-status endpoints.

## 3.4 Design decisions and risks to settle first

- **Hallucination is the central risk.** An LLM asked to name companies matching an ICP will invent plausible names and domains. Nothing LLM-proposed may be persisted as a company until it has been independently verified to exist, and the product's core promise — every claim traceable to a source — depends on holding that line. Treat LLM output as a *search hypothesis*, never as data.
- **Generated leads will have no contacts, so Contact Access is 0 for all of them.** That caps their Lead Score at 80 and systematically ranks them below uploaded companies that have contacts, which makes a single mixed list misleading. Decide explicitly: source contacts as part of generation, rank generated leads in their own list, or accept and clearly label the difference.
- **Cost and quota.** Every generated candidate costs you.com searches and LLM calls, and generation can produce far more companies than a user would ever upload. Cap the candidates per run, and check `RESEARCH_CONCURRENCY` against provider rate limits before turning this loose.
- **Precision over volume.** A short list of verified, genuinely-matching companies is worth more than a long list padded with near-misses, because the scoring engine will spend real research budget on every row.
- **Background execution.** Generation runs are long. They must use the existing batch/job model, and they inherit its limitation: jobs run in-process and do not survive a backend restart (see 1.9). This is the strongest argument for moving to a real queue before shipping.
