/* Mirrors backend/app/routes/icp_imports.py - active prospect upload (brief section 7).
 * Workspace-scoped, NO ICP. Ingestion is fast; live Tavily research + evidence
 * scoring run as a background task, so this returns immediately with
 * scoring_status:"pending". Poll listImportBatches to see it flip to "complete"
 * with real sales-status counts. */
import { ApiError, apiGet, apiPostForm } from "./client";
import type { ImportBatchOut } from "./icp";

export function uploadProspects(workspaceId: string, files: File[]): Promise<ImportBatchOut> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  return apiPostForm<ImportBatchOut>(`/workspaces/${workspaceId}/imports/excel`, formData);
}

/* Per-login upload allowance (2 files per rolling 24 hours). Every FILE
 * counts, onboarding uploads included; deleting an upload does not give a
 * slot back and failed uploads never count. next_available_at is only set
 * once remaining hits 0 - it is when the oldest counted upload leaves the
 * window. The upload call answers 429 with this same shape as its detail. */
export type UploadQuota = {
  message: string | null;
  limit: number;
  used: number;
  remaining: number;
  window_hours: number;
  next_available_at: string | null;
};

export function getUploadQuota(workspaceId: string): Promise<UploadQuota> {
  return apiGet<UploadQuota>(`/workspaces/${workspaceId}/imports/quota`);
}

/** Friendly text for a failed upload. A 429's detail is an object (so
 * ApiError.message is only the generic "Request failed with status 429") -
 * its detail.message is the sentence meant for the user. */
export function uploadErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.detail && typeof err.detail === "object" && "message" in err.detail) {
      const message = (err.detail as { message?: unknown }).message;
      if (typeof message === "string" && message) {
        return message;
      }
    }
    return typeof err.detail === "string" ? err.detail : err.message;
  }
  return "Upload failed. Please try again.";
}

/** "6h 12m", or "12m" under an hour, until the given time (never negative). */
export function formatTimeUntil(iso: string): string {
  const totalMinutes = Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** "Uploads left: N of 2 ..." line shown under the upload button - the reset
 * countdown only appears once the allowance is used up. */
export function describeUploadQuota(quota: UploadQuota): string {
  if (quota.remaining <= 0 && quota.next_available_at) {
    return `Uploads left: 0 of ${quota.limit} · resets in ${formatTimeUntil(quota.next_available_at)}`;
  }
  return `Uploads left: ${Math.max(0, quota.remaining)} of ${quota.limit} in the next ${quota.window_hours} hours`;
}

/** Pre-flight check before sending files: null when the selection fits. */
export function uploadQuotaBlockReason(quota: UploadQuota | null, fileCount: number): string | null {
  if (!quota) {
    return null;
  }
  if (quota.remaining <= 0) {
    return quota.next_available_at
      ? `Upload limit reached — next upload available in ${formatTimeUntil(quota.next_available_at)}.`
      : "Upload limit reached.";
  }
  if (fileCount > quota.remaining) {
    return `You can upload ${quota.remaining} more file${quota.remaining === 1 ? "" : "s"} today.`;
  }
  return null;
}
