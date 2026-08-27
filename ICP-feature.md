# ICP — Ideal Customer Profiles & Lead Generation

Implementation of [`ICP_LEAD_GENERATION_INTENT.md`](ICP_LEAD_GENERATION_INTENT.md), all three phases.

The platform used to only **score** companies someone had already uploaded. This adds the
other half: describe who you want to sell to, and the platform goes and finds them.

```
ICP  →  LLM candidates  →  web verification  →  company rows  →  research  →  scoring  →  Excel
(new)      (new)              (new)             (existing)     (existing)  (existing) (existing)
```

Two ways in — **upload** a list, or **generate** one — converging on one research, scoring
and export path.

---

## The one thing not to undo

An ICP here is a **seed for discovery**, not a filter on scoring.

An earlier ICP existed in this codebase and was deliberately removed. It was a *filter*: it
gated which companies were allowed to score, via `fit_mode` (`strict`/`flexible`) and a
"D6 ICP-fit" band in the old gate/D1–D7 scorer. That model was torn out in favour of
"no ICP, no gates, every company scored on real evidence".

This implementation does not resurrect it:

- ICP decides **which companies get discovered**.
- It has **no term in the Lead Score**. `Lead Score = Buying Evidence + Contact Access −
  Negative Evidence` is unchanged.
- `scoring_config.py` and `evidence_scorer.py` were **not touched** (acceptance criterion 9).
- `icp_profile.fit_mode` is dead weight from the old semantics. The API refuses to accept it;
  the column still exists and is inert.
- `services/icp_filter.py` was **not restored**. Its `filter_companies()` *was* the old
  design. The CRUD helpers live in `services/icp_service.py` instead — renamed precisely so
  the omission is visible.

A test asserts `fit_mode` is not a settable field, and the comments at each tempting
re-entry point say why.

---

## What was built

### Phase 1 — ICP as a first-class page

| Item | Where |
|---|---|
| ICP CRUD API, workspace-scoped | `routes/icp.py`, `controllers/icp.py`, `services/icp_service.py` |
| Schemas | `schemas/icp.py` — `IcpBase` / `IcpCreate` / `IcpOut` |
| Sidebar tab + route | `components/layout/Sidebar.tsx`, `App.tsx` (`/icp`) |
| The page | `features/icp/IcpPage.tsx` |
| API module | `api/icp.ts` (extended; its "CRUD deleted" header corrected) |

Recovered from `2ba62a9^` as the intent doc directed, then adjusted: `fit_mode` dropped from
the payload, and `GET /{icp_id}/companies` deliberately **not** restored.

**Onboarding is unchanged.** Its ICP step was already removed before this work; there was
nothing to migrate. This is a new dashboard page.

### Phase 2 — Generation

`services/lead_generation.py` is the one genuinely new component. Everything else is wiring.

1. **Propose** — the LLM returns candidate *name + country + a domain guess only*, batched
   25 per call, asking for 1.5× the target since verification rejects some. It is never
   asked for revenue, headcount or industry: those come from enrichment against real
   sources, and asking invites confident fabrication.
2. **Verify** — one web search per candidate, domain resolved via
   `company_enrichment.resolve_domain` (which scores domain against name and refuses to
   guess below a confidence floor). Unresolvable candidates are **discarded**.
3. **Deduplicate** — leads whose *resolved* domain the organisation already has are dropped.
   On the resolved domain, never the LLM's guess.
4. **Persist & hand off** — verified leads become company rows through the existing
   `excel_pipeline.run_pipeline`, recorded as a batch, then handed to the **same**
   `score_companies_in_background` an upload uses.

`POST /workspaces/{wid}/icp/{icp_id}/generate` returns the same `ImportBatchOut` an upload
does. The frontend polls the **existing** job endpoints — no new job-tracking API.

**Provenance** — migration `e2b9c4f7a1d8` adds `icp_import_batch.source`
(`'upload' | 'generated'`, default `'upload'`, CHECK-constrained). Generated batches set
`icp_id`. Existing rows backfill correctly: every batch that existed came from a file.

### Phase 3 — Surface

- Upload History has a **Source** column; generated batches carry a badge explaining the
  contact caveat. (`SettingsIcpDataPage.tsx`)
- Enterprise List's batch filter labels generated batches. (`EnterpriseListPage.tsx`)
- Enterprise List now honours `?import_batch_id=…`, so the ICP page's "View these companies"
  opens pre-filtered. It previously ignored the parameter.
- Export already supported `import_batch_id` — no change needed.
- Platform Guide gained an ICP topic covering both the page and the generation flow.

---

## Guardrails, and why they are where they are

**Hallucination is the central risk.** An LLM asked to name companies matching an ICP will
invent plausible ones with plausible domains. The model's output is treated as a *search
hypothesis*, never as data — nothing LLM-proposed becomes a `company` row before an
independent search resolves a real domain for it. The product's promise is that every claim
traces to a source; a generated list of companies that do not exist would break that faster
than any missing feature.

**Generated leads have no contacts.** Contact Access is 0 for every one of them, which caps
their Lead Score at 80 and ranks them below uploaded companies that have contacts. This is
**not** fixed by changing scoring weights. It is handled by *labelling*: `source` on the
batch, a badge in Upload History, a prefix in the Enterprise List filter, and plain copy on
the ICP page and in the guide. The difference is in what is *known* about the company, not
in how good a prospect it is.

**Cost.** Every candidate costs a verification search plus a downstream research pass.
`MAX_TARGET = 100` caps a run regardless of what is requested; verification concurrency is
held at 8, at or below the research stage's default, so generation is not what trips the
search provider's rate limit.

**Idempotency.** `zi_company_id` is hashed from the **resolved** domain via
`table_mapper.synthetic_bigint`, so re-running an ICP updates existing rows rather than
creating twins. Resolve first, then compute the id — the wrong order produces duplicates.

**Failure modes are distinguished.** `503` = the LLM or search service is not configured
(fixable, try later). `422` = it ran and nothing new could be verified (a real answer). A
config problem must never read as "no companies match your ICP".

---

## A bug found on the way

`decision_maker.zi_person_id` is `NOT NULL`, but `upsert_rows` built a contact row for
*every* input row and inserted the ones with no person id. Any spreadsheet line carrying a
company but no identifiable contact aborted the **entire upload** with an integrity error.

`table_mapper` deliberately emits such rows, and its comment said `upsert_rows` "skips
contact creation when the contact id is absent" — behaviour that was never implemented.
Generated companies are contactless by construction, so this surfaced immediately.

Fixed in `excel_pipeline.upsert_rows`; regression test in
`tests/test_lead_generation.py::test_a_row_with_a_company_but_no_contact_ingests_the_company`.
This fixes real uploads too, not just generation.

---

## Two earlier bugs fixed in the ICP form

The previous form hardcoded invented industry labels (`"Software & SaaS"` — ZoomInfo's real
value is `"Software"`) and a persona list missing 10 of the 27 real values. Both silently
matched nothing. `GET /workspaces/{id}/icp/options` now serves the vocabulary from the
backend:

- **Industries** from `core/industry_sectors.py`, the same mapping the Dashboard and
  Enterprise List segment on.
- **Personas** from the `decision_maker.persona` CHECK constraint.
- **Departments** from the organisation's *own contacts*, ranked by frequency — ZoomInfo's
  real labels (`C-Suite`, `Information Technology`, `Engineering & Technical`) are not
  something a hardcoded list guesses correctly. Empty before the first upload, and the UI
  says so rather than offering fiction.

Reversed ranges (`employee_min > employee_max`) are rejected at the schema, because such an
ICP can never match anything and reads to a user as "no such companies exist".

---

## API

All routes are workspace-scoped under `require_workspace_member`.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/workspaces/{wid}/icp` | 201 |
| `GET` | `/workspaces/{wid}/icp` | newest first |
| `GET` | `/workspaces/{wid}/icp/options` | picker vocabulary |
| `GET` | `/workspaces/{wid}/icp/{icp_id}` | |
| `PUT` | `/workspaces/{wid}/icp/{icp_id}` | **full replace** — an omitted field clears it |
| `DELETE` | `/workspaces/{wid}/icp/{icp_id}` | 204 |
| `POST` | `/workspaces/{wid}/icp/{icp_id}/generate` | 201, returns `ImportBatchOut` |

Deleting an ICP never touches data: `icp_import_batch.icp_id` is `ON DELETE SET NULL`, so
batch history survives with the link cleared. Companies, buying events and scores are
organisation-scoped and unaffected.

---

## Tests

**146 backend tests pass** (95 pre-existing + 51 new; `cd backend && python -m pytest`).

- `tests/test_icp.py` (16) — CRUD, workspace isolation, full-replace semantics, idempotent
  delete, history surviving ICP deletion, data-driven departments, range validation,
  `fit_mode` exclusion.
- `tests/test_lead_generation.py` (35) — candidate parsing (including markdown fences and
  six kinds of unusable reply), the verification gate, per-candidate failure isolation,
  domain collapsing, per-organisation dedup, identity stability, prompt construction, target
  capping, batch provenance, and the end-to-end generate flow.

The tests that matter most are the guardrails: an unverifiable company never reaching the
database, and re-running an ICP never duplicating companies.

Frontend: `npx tsc -b` clean, `eslint` 0 errors, production build succeeds. The page was
verified by headless screenshot (list, form, dropdown, empty state, generation panel), since
the auth guards block a headless browser from reaching `/icp` normally.

---

## Acceptance criteria (§6 of the intent doc)

| # | Criterion | |
|---|---|---|
| 1 | ICP sidebar tab; create/edit/list/delete; survives reload | ✅ |
| 2 | Onboarding unchanged | ✅ |
| 3 | Generation produces real, domain-resolved companies | ✅ |
| 4 | No generated company already existed in the org | ✅ |
| 5 | Progress / retry-failed / cancel work through existing job endpoints, unmodified | ✅ |
| 6 | Generated companies structurally indistinguishable from uploaded ones | ✅ |
| 7 | Batch export produces the same Excel shape | ✅ |
| 8 | Upload History distinguishes generated from uploaded | ✅ |
| 9 | `scoring_config.py` / `evidence_scorer.py` untouched | ✅ |
| 10 | Re-running the same ICP does not duplicate companies | ✅ |

---

## Known limitations

- **Generation runs inline, not in the background.** A batch must not be created until we
  know which companies are real, so the LLM pass and verification searches happen inside the
  request. A 100-company run takes a while. The *research and scoring* that follow are
  backgrounded as usual.
- **Background jobs still run in-process** via FastAPI `BackgroundTasks` and do not survive a
  restart (`HANDOVER.md` §1.9). Generation inherits this. It is the strongest argument for a
  real queue before this ships to real users.
- **Generated leads have no contacts.** Deliberate and labelled, not fixed. Sourcing contacts
  during generation is the obvious next step, and would lift these leads onto equal footing
  with uploaded ones.
- **Requires both `LLM_API_KEY` and `YOU_API_KEY`.** Without either, generation returns 503
  rather than degrading — there is no safe degraded mode, since the only alternative to
  verification is trusting the model.
