/* Mirrors backend/app/routes/icp_imports.py */
import { apiPostForBlob } from "./client";

export type ExcelImportStats = {
  filesProcessed: number;
  totalRows: number;
  companiesIngested: number;
  signalsExtracted: number;
  matchedIcp: number;
  activeCount: number;
  nurtureCount: number;
};

export type ExcelImportResult = {
  blob: Blob;
  stats: ExcelImportStats;
};

function statNumber(headers: Headers, name: string): number {
  return Number(headers.get(name) ?? 0);
}

/* Uploads one or more ZoomInfo exports in a single multipart request (the
 * backend's `files: list[UploadFile]` param expects every file under the
 * same "files" field name), runs the full ingestion/signal/scoring
 * pipeline server-side ONCE for the whole batch, and returns both the
 * scored workbook (as a Blob - the backend streams back an .xlsx file, not
 * JSON) and the real pipeline result counts (reported via response
 * headers, since the body has to stay the binary file). */
export async function uploadExcel(workspaceId: string, icpId: string, files: File[]): Promise<ExcelImportResult> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  const { blob, headers } = await apiPostForBlob(
    `/workspaces/${workspaceId}/icp/${icpId}/imports/excel`,
    formData,
  );
  return {
    blob,
    stats: {
      filesProcessed: statNumber(headers, "X-Files-Processed"),
      totalRows: statNumber(headers, "X-Total-Rows"),
      companiesIngested: statNumber(headers, "X-Companies-Ingested"),
      signalsExtracted: statNumber(headers, "X-Signals-Extracted"),
      matchedIcp: statNumber(headers, "X-Matched-Icp"),
      activeCount: statNumber(headers, "X-Active-Count"),
      nurtureCount: statNumber(headers, "X-Nurture-Count"),
    },
  };
}
