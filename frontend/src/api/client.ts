/* Shared fetch wrapper for every file in src/api/. One file per backend
 * routes/*.py file - keep that mapping when adding new endpoints. */
import { clearAuthTokens, getAccessToken, getRefreshToken } from "../lib/authToken";
import { gatewayRefresh } from "../lib/gatewayAuth";

export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8175";

async function authHeaders(): Promise<Record<string, string>> {
  const token = getAccessToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// A single in-flight refresh shared by every caller: several requests can hit
// a 401 near-simultaneously (e.g. a page mount firing 3-4 parallel fetches
// right as the access token expires), and each one racing its own /refresh
// call would let one rotation invalidate another's - the exact kind of
// intermittent logout this exists to fix.
let refreshInFlight: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    const refreshToken = getRefreshToken();
    refreshInFlight = (refreshToken ? gatewayRefresh(refreshToken).then(() => true) : Promise.resolve(false))
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** Runs one request; on a 401, tries ONE silent token refresh and retries
 * once before giving up. Only a 401 that survives a fresh access token means
 * the session is genuinely over - previously ANY 401 cleared the session
 * immediately, so a token expiring mid-session (often first surfaced by the
 * next sidebar navigation's data fetch) force-logged the user out instead of
 * silently renewing. */
async function fetchWithAuthRetry(request: () => Promise<Response>): Promise<Response> {
  const response = await request();
  if (response.status !== 401) return response;

  const refreshed = await refreshAccessToken();
  if (!refreshed) {
    clearAuthTokens();
    return response;
  }

  const retryResponse = await request();
  if (retryResponse.status === 401) {
    // The gateway accepted the refresh but the session still isn't valid -
    // genuinely logged out (e.g. the refresh token itself was revoked).
    clearAuthTokens();
  }
  return retryResponse;
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
  const token = getAccessToken();
  if (!token) {
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }

  const response = await fetchWithAuthRetry(async () =>
    fetch(`${BASE_URL}${path}`, {
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(await authHeaders()),
        ...options.headers,
      },
    }),
  );

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

export async function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }
  const response = await fetchWithAuthRetry(async () =>
    fetch(`${BASE_URL}${path}`, {
      method: "POST",
      body: formData,
      headers: await authHeaders(),
    }),
  );
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }
  return (await response.json()) as T;
}

export async function apiPostForBlob(
  path: string,
  formData: FormData,
): Promise<{ blob: Blob; headers: Headers }> {
  const token = getAccessToken();
  if (!token) {
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }
  const response = await fetchWithAuthRetry(async () =>
    fetch(`${BASE_URL}${path}`, {
      method: "POST",
      body: formData,
      headers: await authHeaders(),
    }),
  );
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }
  return { blob: await response.blob(), headers: response.headers };
}

export async function apiGetForBlob(path: string): Promise<{ blob: Blob; headers: Headers }> {
  const token = getAccessToken();
  if (!token) {
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }
  const response = await fetchWithAuthRetry(async () => fetch(`${BASE_URL}${path}`, { headers: await authHeaders() }));
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }
  return { blob: await response.blob(), headers: response.headers };
}
