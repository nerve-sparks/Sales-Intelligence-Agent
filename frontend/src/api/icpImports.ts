/* Mirrors backend/app/routes/icp_imports.py */
import { apiPostForBlob } from "./client";

/* Uploads a ZoomInfo export and returns the scored workbook as a Blob -
 * the backend streams back an .xlsx file, not JSON. */
export function uploadExcel(workspaceId: string, icpId: string, file: File): Promise<Blob> {
  const formData = new FormData();
  formData.append("file", file);
  return apiPostForBlob(`/workspaces/${workspaceId}/icp/${icpId}/imports/excel`, formData);
}
