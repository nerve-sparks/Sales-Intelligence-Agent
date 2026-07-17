/* Shared fetch wrapper for every file in src/api/. One file per backend
 * routes/*.py file - keep that mapping when adding new endpoints. */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8175";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `Request failed with status ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

async function parseErrorDetail(response: Response): Promise<unknown> {
  try {
    const body = await response.json();
    return body?.detail ?? body;
  } catch {
    return response.statusText;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
}

/* For endpoints that return a binary file (e.g. the scored Excel download)
 * instead of JSON. Headers are returned alongside the blob since some
 * endpoints (the Excel import pipeline) report real result counts via
 * custom response headers - the body has to stay the binary file. */
export async function apiPostForBlob(
  path: string,
  formData: FormData,
): Promise<{ blob: Blob; headers: Headers }> {
  const response = await fetch(`${BASE_URL}${path}`, { method: "POST", body: formData });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }
  return { blob: await response.blob(), headers: response.headers };
}

/* Same idea as apiPostForBlob but for GET endpoints that stream back a
 * binary file (e.g. the Enterprise List's company export). */
export async function apiGetForBlob(path: string): Promise<{ blob: Blob; headers: Headers }> {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }
  return { blob: await response.blob(), headers: response.headers };
}
