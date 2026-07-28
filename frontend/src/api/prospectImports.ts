/* Mirrors backend/app/routes/icp_imports.py - active prospect upload (brief section 7).
 * Workspace-scoped, NO ICP. Ingestion is fast; live Tavily research + evidence
 * scoring run as a background task, so this returns immediately with
 * scoring_status:"pending". Poll listImportBatches to see it flip to "complete"
 * with real sales-status counts. */
import { apiPostForm } from "./client";
import type { ImportBatchOut } from "./icp";

export function uploadProspects(workspaceId: string, files: File[]): Promise<ImportBatchOut> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  return apiPostForm<ImportBatchOut>(`/workspaces/${workspaceId}/imports/excel`, formData);
}
