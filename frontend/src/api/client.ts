/* Shared fetch wrapper for every file in src/api/. One file per backend
 * routes/*.py file - keep that mapping when adding new endpoints. */
import { auth } from "../lib/firebase";

export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8175";

/* Attaches the current Firebase session as a bearer token so the backend
 * can verify who's actually calling (see backend/app/core/auth.py) -
 * without this every request looked anonymous no matter who was logged in.
 * Empty when logged out; those endpoints don't all require auth yet, so an
 * absent header is a normal, non-error state, not something to throw on. */
async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

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
      ...(await authHeaders()),
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

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}

/* For endpoints that take a multipart file and return JSON (e.g. the logo
 * upload) - as opposed to apiPostForBlob below, which is FormData in AND a
 * binary file out. */
export async function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    body: formData,
    headers: await authHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }
  return (await response.json()) as T;
}

/* For endpoints that return a binary file (e.g. the scored Excel download)
 * instead of JSON. Headers are returned alongside the blob since some
 * endpoints (the Excel import pipeline) report real result counts via
 * custom response headers - the body has to stay the binary file. */
export async function apiPostForBlob(
  path: string,
  formData: FormData,
): Promise<{ blob: Blob; headers: Headers }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    body: formData,
    headers: await authHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }
  return { blob: await response.blob(), headers: response.headers };
}

/* Same idea as apiPostForBlob but for GET endpoints that stream back a
 * binary file (e.g. the Enterprise List's company export). */
export async function apiGetForBlob(path: string): Promise<{ blob: Blob; headers: Headers }> {
  const response = await fetch(`${BASE_URL}${path}`, { headers: await authHeaders() });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }
  return { blob: await response.blob(), headers: response.headers };
}
