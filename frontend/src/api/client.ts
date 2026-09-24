/* Shared fetch wrapper for every file in src/api/. One file per backend
 * routes/*.py file - keep that mapping when adding new endpoints. */
import { clearAuthTokens, getAccessToken, getRefreshToken } from "../lib/authToken";
import { GatewayAuthError, gatewayRefresh } from "../lib/gatewayAuth";
import { getWorkspaceId } from "../lib/session";

export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8175";

/* Companies, contacts, signals and scores are WORKSPACE-scoped (backend
 * migration a3f8d21c6b94): the organisation in the path is the authorisation
 * boundary, the workspace decides which data you actually see. Every such
 * endpoint therefore needs the active workspace alongside the org.
 *
 * Read from session here rather than threaded through ~10 pages' worth of
 * call sites: getWorkspaceId() is already the single source every page reads
 * for "which workspace am I in", and this file already pulls the auth token
 * from session the same way. Switching workspace reloads the page, so this is
 * always the workspace the UI is currently showing. */
export function withWorkspace(params: URLSearchParams): URLSearchParams {
  const workspaceId = getWorkspaceId();
  if (workspaceId) {
    params.set("workspace_id", workspaceId);
  }
  return params;
}

export function workspaceQuery(extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const qs = withWorkspace(params).toString();
  return qs ? `?${qs}` : "";
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = getAccessToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/** "invalid" is the ONLY outcome that ends a session: the gateway looked at
 * the refresh token and rejected it. "unavailable" means we never got an
 * answer (offline, DNS, timeout, gateway 5xx) - that says nothing about
 * whether the user is signed in, so the session must survive it. */
type RefreshOutcome = "refreshed" | "invalid" | "unavailable";

// A single in-flight refresh shared by every caller: several requests can hit
// a 401 near-simultaneously (e.g. a page mount firing 3-4 parallel fetches
// right as the access token expires), and each one racing its own /refresh
// call would let one rotation invalidate another's.
let refreshInFlight: Promise<RefreshOutcome> | null = null;

async function runRefresh(): Promise<RefreshOutcome> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return "invalid";
  try {
    await gatewayRefresh(refreshToken);
    return "refreshed";
  } catch (error) {
    // Only an explicit rejection from the gateway means the session is over.
    // Anything else - fetch() throwing on a network error, a timeout, a 502
    // while the gateway restarts - is an availability problem, and treating
    // it as a logout is what made sessions drop at random.
    if (error instanceof GatewayAuthError && error.status >= 400 && error.status < 500) {
      return "invalid";
    }
    return "unavailable";
  }
}

function refreshAccessToken(tokenUsedForRequest: string | null): Promise<RefreshOutcome> {
  // Another tab (or an earlier request in this one) may already have renewed
  // the token while this request was in flight. Spending the refresh token
  // again would make a rotating gateway reject the second call and look like
  // an invalid session, so reuse what is already there instead.
  const current = getAccessToken();
  if (current && current !== tokenUsedForRequest) {
    return Promise.resolve("refreshed");
  }

  if (!refreshInFlight) {
    refreshInFlight = runRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Runs one request; on a 401, tries ONE silent token refresh and retries
 * once. The session is cleared only when the gateway explicitly rejects the
 * refresh token - never because a request or the gateway itself failed. */
async function fetchWithAuthRetry(request: () => Promise<Response>): Promise<Response> {
  const tokenUsedForRequest = getAccessToken();
  const response = await request();
  if (response.status !== 401) return response;

  const outcome = await refreshAccessToken(tokenUsedForRequest);
  if (outcome === "invalid") {
    clearAuthTokens();
    return response;
  }
  if (outcome === "unavailable") {
    // Keep the session and let the caller surface a normal error. The user
    // stays signed in and the next request succeeds once the gateway is back.
    return response;
  }

  // Refreshed: the gateway confirmed this session is live. If our own backend
  // still answers 401 the problem is on that side (most often its JWKS fetch
  // failing), so the error is surfaced without signing the user out - logging
  // them out would not fix it, since signing back in returns the same token.
  return request();
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
