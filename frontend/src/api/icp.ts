/* Three separate things share this module for historical reasons (the name
 * predates the split, and the shared types have many importers):
 *
 * - ICP CRUD (IcpOut/IcpCreate/listIcps/...) mirrors backend/app/routes/icp.py,
 *   backing the ICP page at /icp. An ICP here is a *seed for discovery* - it
 *   describes which companies to go find. It is NOT a filter on scoring and
 *   has no term in the Lead Score; see ICP_LEAD_GENERATION_INTENT.md.
 * - CompanyOut/DecisionMakerOut are general-purpose types several pages import.
 * - listImportBatches/ImportBatchOut and the job* helpers back Onboarding/
 *   Settings' upload history, which has no ICP dependency and hits
 *   backend/app/routes/icp_imports.py. */
import { apiDelete, apiGet, apiPost, apiPut } from "./client";

export type DecisionMakerOut = {
  decision_maker_id: string;
  company_id: string;
  zi_person_id: number;
  first_name: string | null;
  last_name: string | null;
  picture_url: string | null;
  job_title: string | null;
  department: string | null;
  years_of_experience: string | null;
  persona: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  linkedin_url: string | null;
};

export type CompanyOut = {
  company_id: string;
  zi_company_id: number;
  company_name: string;
  company_domain: string | null;
  company_type: string | null;
  company_status: string | null;
  is_verified: boolean | null;
  employee_count: number | null;
  employee_range: string | null;
  revenue_usd: number | null;
  revenue_range: string | null;
  ownership_type: string | null;
  founded_year: string | null;
  description: string | null;
  logo_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  continent: string | null;
  primary_industry: string[] | null;
  industries: string[] | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  facebook_url: string | null;
  total_funding_amount: number | null;
  recent_funding_amount: number | null;
  recent_funding_date: string | null;
  company_funding: unknown;
  employee_growth: unknown;
  competitors: unknown;
  technologies: string[] | null;
  products: string[] | null;
  decision_makers?: DecisionMakerOut[];
};

export type ImportBatchOut = {
  import_batch_id: string;
  workspace_id: string | null;
  /* How this batch's companies came to exist. "generated" batches were
   * discovered from an ICP (icp_id names it) and arrive with no contacts, so
   * their Contact Access is 0 and their Lead Score is capped lower than an
   * uploaded company's - which is why the two are labelled rather than mixed
   * silently. */
  source: "upload" | "generated";
  icp_id: string | null; // set for generated batches, null for uploads
  icp_name: string | null;
  file_names: string[] | null;
  files_processed: number;
  total_rows: number;
  companies_ingested: number;
  signals_extracted: number;
  // New pipeline sales-status counts.
  sales_ready_count: number;
  high_priority_count: number;
  warm_count: number;
  monitor_count: number;
  low_priority_count: number;
  // Legacy read-only counters.
  matched_icp_count: number;
  active_count: number;
  nurture_count: number;
  // "pending" while research + scoring is still running in the background -
  // counts are 0 until this flips to "complete".
  scoring_status: "pending" | "complete";
  // Operational status of the background task (brief items 21, 23).
  research_status: "pending" | "complete" | "complete_with_warnings" | "failed";
  companies_researched: number;
  research_failure_count: number;
  llm_failure_count: number;
  scoring_failure_count: number;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  processing_error: string | null;
  processing_warnings: string[] | null;
  created_at: string | null;
};

/* Every prospect upload in this workspace, newest first - the persisted audit
 * trail for the Settings prospect-data page and Enterprise List's per-upload
 * filter. Workspace-scoped, no ICP (brief section 7). */
export function listImportBatches(workspaceId: string): Promise<ImportBatchOut[]> {
  return apiGet<ImportBatchOut[]>(`/workspaces/${workspaceId}/imports`);
}

export type DeleteImportOut = {
  import_batch_id: string;
  file_names: string[];
  companies_deleted: number;
  /* Companies that ALSO belong to another upload and were therefore spared.
   * company_import_batch is a permanent many-to-many, so deleting an older
   * upload must not destroy companies a newer one still contains - surfacing
   * this lets the UI say what actually happened instead of implying all of
   * the batch's companies were removed. */
  companies_kept: number;
  buying_events_deleted: number;
};

/* Destructive and irreversible: deletes the upload AND the companies it
 * introduced, along with their buying events, scores and contacts. */
export function deleteImportBatch(
  workspaceId: string,
  importBatchId: string,
): Promise<DeleteImportOut> {
  return apiDelete<DeleteImportOut>(`/workspaces/${workspaceId}/imports/${importBatchId}`);
}

/* Per-company job monitoring for one upload (mirrors backend/app/schemas/job.py) -
 * "job" here is exactly this same ImportBatchOut/import_batch_id, just a
 * live per-company-status read view on top of it. Polled from the frontend
 * instead of keeping the upload request open. */

export type JobStatus = "queued" | "processing" | "partially_completed" | "completed" | "failed" | "cancelled";

export type CompanyJobStatus = "queued" | "researching" | "scoring" | "completed" | "retrying" | "failed" | "needs_review";

export type JobStatusOut = {
  job_id: string;
  status: JobStatus;
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  needs_review: number;
  progress_percentage: number;
};

export type JobItemOut = {
  company_id: string;
  company_name: string;
  status: CompanyJobStatus;
  error_message: string | null;
  retry_count: number;
  started_at: string | null;
  completed_at: string | null;
};

export type JobItemsOut = {
  items: JobItemOut[];
  total: number;
  page: number;
  page_size: number;
};

export type RetryFailedOut = {
  retried_count: number;
  status: JobStatusOut;
};

export function getJobStatus(workspaceId: string, importBatchId: string): Promise<JobStatusOut> {
  return apiGet<JobStatusOut>(`/workspaces/${workspaceId}/imports/${importBatchId}`);
}

export function getJobItems(
  workspaceId: string,
  importBatchId: string,
  params: { page?: number; page_size?: number; status?: CompanyJobStatus } = {},
): Promise<JobItemsOut> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));
  if (params.status) query.set("status", params.status);
  const qs = query.toString();
  return apiGet<JobItemsOut>(`/workspaces/${workspaceId}/imports/${importBatchId}/items${qs ? `?${qs}` : ""}`);
}

export function retryFailedJobItems(workspaceId: string, importBatchId: string): Promise<RetryFailedOut> {
  return apiPost<RetryFailedOut>(`/workspaces/${workspaceId}/imports/${importBatchId}/retry-failed`);
}

export function cancelJob(workspaceId: string, importBatchId: string): Promise<JobStatusOut> {
  return apiPost<JobStatusOut>(`/workspaces/${workspaceId}/imports/${importBatchId}/cancel`);
}

/* ── ICP definitions (mirrors backend/app/routes/icp.py) ──────────────────
 *
 * Every criterion is optional; an unset one means "no constraint". There is
 * deliberately no `fit_mode` and no "companies matching this ICP" call - both
 * belonged to the removed ICP-as-scoring-filter design. */

export type IcpOut = {
  icp_id: string;
  workspace_id: string;
  name: string | null;
  industries: string[] | null;
  employee_min: number | null;
  employee_max: number | null;
  revenue_min_usd: number | null;
  revenue_max_usd: number | null;
  countries: string[] | null;
  technologies: string[] | null;
  buying_committee_personas: string[] | null;
  departments: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

export type IcpCreate = {
  name?: string | null;
  industries?: string[] | null;
  employee_min?: number | null;
  employee_max?: number | null;
  revenue_min_usd?: number | null;
  revenue_max_usd?: number | null;
  countries?: string[] | null;
  technologies?: string[] | null;
  buying_committee_personas?: string[] | null;
  departments?: string[] | null;
};

/* Picker vocabulary, served by the backend so the form can't drift from the
 * values real data actually uses. `departments` is read from this org's own
 * contacts and is empty before any upload. */
export type IcpOptionsOut = {
  industries: string[];
  sectors: Record<string, string[]>;
  personas: string[];
  departments: string[];
};

export function listIcps(workspaceId: string): Promise<IcpOut[]> {
  return apiGet<IcpOut[]>(`/workspaces/${workspaceId}/icp`);
}

export function getIcpOptions(workspaceId: string): Promise<IcpOptionsOut> {
  return apiGet<IcpOptionsOut>(`/workspaces/${workspaceId}/icp/options`);
}

export function createIcp(workspaceId: string, payload: IcpCreate): Promise<IcpOut> {
  return apiPost<IcpOut>(`/workspaces/${workspaceId}/icp`, payload);
}

/* Full-replace (PUT): the edit form submits every field, so an omitted field
 * means "clear this criterion", not "leave it unchanged". */
export function updateIcp(workspaceId: string, icpId: string, payload: IcpCreate): Promise<IcpOut> {
  return apiPut<IcpOut>(`/workspaces/${workspaceId}/icp/${icpId}`, payload);
}

/* Upload history survives: icp_import_batch.icp_id is ON DELETE SET NULL, so
 * past uploads keep their counts and only lose the ICP link. Companies,
 * buying events and scores are organisation-scoped and untouched. */
export function deleteIcp(workspaceId: string, icpId: string): Promise<void> {
  return apiDelete<void>(`/workspaces/${workspaceId}/icp/${icpId}`);
}

/* Discovers new companies from an ICP: an LLM proposes candidates, each is
 * verified against live web search, and only the verified ones become
 * companies. Returns the SAME ImportBatchOut an upload does, with
 * scoring_status "pending" - poll the existing job endpoints (getJobStatus /
 * getJobItems / retryFailedJobItems / cancelJob) exactly as for an upload.
 *
 * Slow by nature (one search per candidate) and can legitimately fail with:
 *   503 - the LLM or search service isn't configured
 *   422 - nothing new could be verified (all invented, or all already owned) */
export function generateLeads(
  workspaceId: string,
  icpId: string,
  target: number,
): Promise<ImportBatchOut> {
  return apiPost<ImportBatchOut>(`/workspaces/${workspaceId}/icp/${icpId}/generate`, { target });
}
