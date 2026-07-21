/* Mirrors backend/app/routes/uploads.py */
import { apiPostForm } from "./client";

export type UploadOut = {
  url: string;
};

export function uploadLogo(file: File): Promise<UploadOut> {
  const formData = new FormData();
  formData.append("file", file);
  return apiPostForm<UploadOut>("/uploads/logo", formData);
}
