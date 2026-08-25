/* Historical module name (kept, like ImportBatchOut's own icp_id/icp_name
 * fields, so callers don't churn over a rename) - the ICP CRUD API this file
 * used to mirror (backend/app/routes/icp.py) has been deleted entirely (no
 * ICP anywhere in the active product). CompanyOut/DecisionMakerOut are
 * general-purpose types several pages still import from here;
 * listImportBatches/ImportBatchOut back Onboarding/Settings' upload history,
 * which has no ICP dependency and hits backend/app/routes/icp_imports.py. */
import { apiDelete, apiGet, apiPost } from "./client";

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
  icp_id: string | null; // legacy, null for new prospect uploads
  icp_name: string | null; // legacy
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
