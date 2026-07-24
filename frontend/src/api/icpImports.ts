/* Mirrors backend/app/routes/icp_imports.py */
import { apiPostForm } from "./client";
import type { ImportBatchOut } from "./icp";

/* Uploads one or more ZoomInfo exports in a single multipart request (the
 * backend's `files: list[UploadFile]` param expects every file under the
 * same "files" field name). Ingestion + signal extraction run synchronously
 * (fast), then scoring runs as a background task on the server - this
 * returns as soon as the fast part is done, with scoring_status:"pending"
 * on the returned batch. Poll listImportBatches (or re-fetch) to see it
 * flip to "complete" with real active_count/nurture_count once scoring
 * catches up - Enterprise List will show newly-scored companies
 * progressively in the meantime, since scoring commits in chunks as it
 * goes rather than all at once. */
export function uploadExcel(workspaceId: string, icpId: string, files: File[]): Promise<ImportBatchOut> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  return apiPostForm<ImportBatchOut>(`/workspaces/${workspaceId}/icp/${icpId}/imports/excel`, formData);
}
