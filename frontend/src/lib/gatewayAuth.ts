/* Login / register / refresh / logout. These go to OUR backend's /auth/*
 * endpoints, which forward them to the NervesParks auth-gateway and return
 * the gateway's response unchanged - the browser never calls the gateway
 * directly. Tokens are still issued by the gateway.
 *
 * Login is email + password only (no tenant id). */
import { clearAuthTokens, setAuthTokens } from "./authToken";

// Same source as api/client.ts's BASE_URL (not imported from there - client.ts
// already imports this module).
const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8175").replace(
  /\/$/,
  "",
);

function gatewayUrl(path: string): string {
  return `${API_BASE}/auth${path.startsWith("/") ? path : `/${path}`}`;
}

function unwrapData(body: Record<string, unknown>): Record<string, unknown> {
  const data = body.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return body;
}

function pickTokens(data: Record<string, unknown>): { access: string; refresh: string | null } {
  const access =
    (typeof data.access_token === "string" && data.access_token) ||
    (typeof data.accessToken === "string" && data.accessToken) ||
    null;
  const refresh =
    (typeof data.refresh_token === "string" && data.refresh_token) ||
    (typeof data.refreshToken === "string" && data.refreshToken) ||
    null;
  if (!access) {
    throw new Error("Auth gateway did not return an access token.");
  }
  return { access, refresh };
}

export class GatewayAuthError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function gatewayPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(gatewayUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const err = payload.error;
    const message =
      (err && typeof err === "object" && typeof (err as { message?: string }).message === "string"
        ? (err as { message: string }).message
        : null) ||
      (typeof payload.detail === "string" ? payload.detail : null) ||
      `Authentication failed (${response.status})`;
    throw new GatewayAuthError(message, response.status);
  }
  return unwrapData(payload);
}

export async function gatewayLogin(email: string, password: string): Promise<void> {
  const data = await gatewayPost("/login", { email, password });
  const { access, refresh } = pickTokens(data);
  setAuthTokens(access, refresh);
}

export async function gatewayRegister(
  email: string,
  password: string,
  displayName: string,
): Promise<void> {
  // The backend adds the gateway's required tenant_id (AUTH_TENANT_ID, or "default").
  const data = await gatewayPost("/register", {
    email,
    password,
    display_name: displayName,
  });
  const { access, refresh } = pickTokens(data);
  setAuthTokens(access, refresh);
}

/** POST /refresh (confirmed against the gateway's own OpenAPI spec) - trades
 * the stored refresh token for a new access token before it's known to be
 * expired, so a client-side 401 never has to be the first sign of it. */
export async function gatewayRefresh(refreshToken: string): Promise<void> {
  const data = await gatewayPost("/refresh", { refresh_token: refreshToken });
  const { access, refresh } = pickTokens(data);
  setAuthTokens(access, refresh);
}

export async function gatewayLogout(): Promise<void> {
  const refresh = localStorage.getItem("refresh_token");
  const access = localStorage.getItem("auth_token");
  try {
    if (refresh) {
      await gatewayPost("/logout", {
        refresh_token: refresh,
        access_token: access,
      });
    }
  } catch {
    /* still clear local session */
  }
  clearAuthTokens();
}
