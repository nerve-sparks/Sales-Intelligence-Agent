# Intent: ICP-Driven Lead Generation

**Status:** proposed, not built
**Owner:** incoming engineer
**Related:** `HANDOVER.md` Part 3

---

## 1. Intent

The platform currently only **scores** leads. A company must already exist in a spreadsheet the user uploads; the system researches and ranks it but never discovers anyone new.

This change adds the other half: the user describes their ideal customer on a new **ICP page**, an LLM proposes matching companies, you.com researches them, the existing engine scores them, and the result is delivered as an Excel sheet.

```
ICP data  →  LLM  →  you.com  →  scoring  →  Excel
(new page)  (new)   (existing)  (existing)  (existing)
```

Two ways in — **upload** an existing list, or **generate** a new one — converging on one research, scoring and export path.

### The reframe that matters

An ICP already existed in this codebase and was deliberately removed. It was a **filter**: it gated which companies were allowed to score, via `fit_mode` (`strict`/`flexible`) and a "D6 ICP-fit" band in the old gate/D1–D7 scorer. That whole model was torn out in favour of "no ICP, no gates, every company scored on real evidence".

**The new ICP must not resurrect that.** It is a **seed for generation**, not a filter on scoring. Concretely:

- ICP decides *which companies get discovered*.
- It has **no term in the Lead Score**. Do not add one. `Lead Score = Buying Evidence + Contact Access − Negative Evidence` stays exactly as it is.
- Once a generated company exists, it is scored on evidence like any other, and can legitimately score 0.
- `icp_profile.fit_mode` is dead weight from the old semantics. Ignore it; drop it in a later migration.

Getting this wrong reintroduces the exact design the product moved away from, and the reasoning is documented in `scoring_config.py` and `evidence_scorer.py`.

---

## 2. What already exists

Most of this feature is wiring between built-and-tested components. **Reuse, do not rebuild.**

| Need | Reuse | Notes |
|---|---|---|
| ICP storage | `IcpProfile` / `icp_profile` table | Already workspace-scoped with the right fields. Revive it; do not add a second table. |
| ICP CRUD API | **Recover from git** | Deleted in commit `2ba62a9` *"icp structure changed and pipeline revised"*. Retrieve with `git show 2ba62a9^:backend/app/routes/icp.py` and `...:backend/app/controllers/icp.py`. Prefix was `/workspaces/{workspace_id}/icp`, guarded by `require_workspace_member`. |
| Company identity | `table_mapper.synthetic_bigint()` + `zoominfo_mapper.company_uuid()` | `company.zi_company_id` is `BIGINT NOT NULL` and half of unique `(organisation_id, zi_company_id)`. Generated companies have no ZoomInfo ID — same problem plain-CSV uploads already solve by hashing domain into a stable BIGINT. Stability means re-running an ICP updates rather than duplicates. |
| Domain resolution | `company_enrichment.py` | Already resolves a real domain from search results, with 19 tests including negative cases. This *is* the verification step. |
| Research | `search_signal_ingest.research_companies()` | Reads company rows from the DB, not from spreadsheets, so it works unchanged on generated companies. |
| Firmographics | `company_enrichment.enrich_missing_firmographics()` | Matters more here than on upload: generated leads arrive nearly empty. |
| Scoring | `evidence_scorer.py` | No change. |
| Pipeline orchestration | `excel_pipeline.score_companies_in_background()` | Research → enrichment → scoring, already chunked and committed. Hand off to it. |
| Progress / retry / cancel | `icp_import_batch` + `company_import_batch` | Model a generation run as a batch and job polling, `retry-failed` and `cancel` all come free. **`icp_import_batch.icp_id` FK already exists** (SET NULL) — use it to link a run to its ICP. |
| Excel output | `build_export_workbook()`, `GET /companies/export?import_batch_id=…` | **Already done.** Point the export at the generation batch. |
| LLM | `llm_client.complete()` | Langfuse tracing and cost attribution included. |
| Relevance context | `organisation.offering_profile` | Feed into the generation prompt — same profile that drives relevance scoring, so generation and scoring agree on what "relevant" means. |

### ICP field reference (`icp_profile`)

`industries` `TEXT[]` · `employee_min` / `employee_max` `INT` · `revenue_min_usd` / `revenue_max_usd` `BIGINT` · `countries` `TEXT[]` · `technologies` `TEXT[]` · `buying_committee_personas` `TEXT[]` · `departments` `TEXT[]` · `fit_mode` *(legacy, ignore)*

---

## 3. Build plan

### Phase 1 — ICP as a first-class page

1. **Restore the ICP CRUD API** from git (see table above), re-registering the router in `main.py`. Keep it workspace-scoped under `require_workspace_member`. Drop `fit_mode` from the payload.
2. **Add the sidebar tab.** `frontend/src/components/layout/Sidebar.tsx` → append to `navItems` (`{ icon, label: "ICP", href: "/icp" }`); register `/icp` in the `routes` array in `App.tsx`, inside `RequireAuth` + `RequireOnboarding`.
3. **Build the ICP page** at `frontend/src/features/icp/IcpPage.tsx`: list existing ICPs, create/edit form over the fields above, delete. Follow the existing panel patterns in `SettingsIcpDataPage.tsx`.
4. **Frontend API module** — extend `frontend/src/api/icp.ts`. Its header comment currently documents the CRUD API's deletion; update it.

> **On "moving ICP from Onboarding":** onboarding's ICP-creation step was already removed (see the comment above `OfferingProspectDataForm`). Current steps are Organization Setup → Workspace Setup → Team Invitations → Offering & Prospect Data → Business Discovery → Go Live. There is nothing left to delete there — this is a *new* dashboard page, and onboarding stays as it is. Do not re-add an ICP step; requiring an ICP before first upload is what the earlier redesign removed.

**Ships value on its own:** users can define and save ICPs before generation exists.

### Phase 2 — Generation, behind a flag

5. **`services/lead_generation.py`** — the genuinely new component.
   - Input: an `IcpProfile` + `organisation.offering_profile` + a target count.
   - Prompt returns **candidate name + country + a domain guess only**. Do not ask the LLM for revenue, headcount or industry: those come from enrichment against real sources, and asking invites confident fabrication.
   - **Batch the calls** (e.g. 20–25 candidates per call, loop to the target). One call for hundreds of names degrades badly and truncates.
   - Ask for more candidates than the target, since verification will reject some.
   - Output: unverified candidates. Persist nothing yet.

6. **Verification** — for each candidate, one you.com search; confirm the company exists and resolve its domain via `company_enrichment`. Reject anything unresolvable. **Only verified candidates become `company` rows.**

7. **Deduplication** — drop candidates whose resolved domain already exists in the organisation, so generation never re-adds an uploaded company. Do this after resolution, not on the LLM's domain guess.

8. **Provenance** — add `source` to `icp_import_batch` (`'upload'` | `'generated'`, default `'upload'`) in a new Alembic migration. Set `icp_id` on generated batches. This is what lets the UI label generated leads and keeps the two populations comparable in reporting.

9. **Generation-run endpoint** — `POST /workspaces/{wid}/icp/{icp_id}/generate` returning `ImportBatchOut`. It should: create the batch → run generation + verification → create companies and `company_import_batch` rows → hand off to `score_companies_in_background`. The frontend then polls the **existing** `GET /workspaces/{wid}/imports/{id}` and lists items through the existing endpoint. No new job-tracking API.

### Phase 3 — Surface and hardening

10. Generated batches appear in Upload History labelled by source, and Enterprise List can filter to them (`import_batch_id` already supported everywhere).
11. Export via the existing endpoint scoped to the batch.
12. Add the ICP page and generation flow to the in-app Platform Guide (`components/guide/PlatformGuide.tsx`).

---

## 4. Data model changes

| Change | Migration |
|---|---|
| `icp_import_batch.source` — `TEXT NOT NULL DEFAULT 'upload'`, check `IN ('upload','generated')` | new revision on head `d1a7f3c8e5b2` |
| *(optional, later)* drop `icp_profile.fit_mode` and its check constraint | separate revision |

Nothing else. `icp_profile`, `company`, `company_import_batch`, `buying_event` and `lead_score` are all already shaped for this.

---

## 5. Guardrails

These are the decisions that determine whether the feature is trustworthy.

- **Hallucination is the central risk.** An LLM asked to name companies matching an ICP will invent plausible names and domains. Treat its output as a *search hypothesis*, never as data. Nothing LLM-proposed may be written as a `company` row before independent verification. The product's core promise — every claim traceable to a source — depends on holding this line, and a generated list of companies that do not exist would destroy trust faster than any missing feature.
- **Generated leads have no contacts, so Contact Access is 0 for every one of them.** That caps their Lead Score at 80 and ranks them systematically below uploaded companies that have contacts. A single mixed list is therefore misleading. Decide explicitly: source contacts during generation, keep generated leads in their own list, or accept it and label clearly. **Do not** "fix" this by changing the scoring weights.
- **Cost and quota.** Every candidate costs a verification search plus a research pass. Generation can produce far more companies than anyone would upload by hand. Cap candidates per run, and check `RESEARCH_CONCURRENCY` against you.com and LLM rate limits before opening it up.
- **Precision over volume.** A short verified list beats a long padded one, because every row spends real research budget.
- **Idempotency.** Because identities are hashed from domain, re-running the same ICP updates existing companies instead of duplicating them — provided you always resolve the domain before computing the ID. Get this order wrong and you get twins.
- **Background execution.** Runs are long and inherit the existing limitation: jobs run in-process via `BackgroundTasks` and do not survive a backend restart (`HANDOVER.md` §1.9). This is the strongest argument for moving to a real queue before this ships to real users.

---

## 6. Acceptance criteria

1. ICP appears as a sidebar tab; ICPs can be created, edited, listed and deleted, and survive a reload.
2. Onboarding is unchanged.
3. A generation run from an ICP produces a batch whose companies are all real and domain-resolved.
4. No company in a generated batch already existed in that organisation.
5. Progress, retry-failed and cancel work through the existing job endpoints, unmodified.
6. Generated companies carry buying events, Lead Scores and Sales Statuses indistinguishable in structure from uploaded ones.
7. Batch export produces the same Excel shape as an uploaded batch.
8. Upload History distinguishes generated from uploaded batches.
9. `scoring_config.py` and `evidence_scorer.py` are untouched — the score formula has no ICP term.
10. Re-running the same ICP does not duplicate companies.
