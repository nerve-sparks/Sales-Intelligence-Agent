/* Talks to the NervesParks auth-gateway for login / register / logout.
 * Our backend only verifies the resulting JWT — it never sees passwords.
 *
 * Login is email + password only (no tenant id). */
import { clearAuthTokens, setAuthTokens } from "./authToken";

const GATEWAY_BASE =
  (import.meta.env.VITE_AUTH_GATEWAY_BASE_URL as string | undefined)?.replace(/\/$/, "") ??
  "https://auth.nervesparks.com";
const GATEWAY_PREFIX = (import.meta.env.VITE_AUTH_GATEWAY_PREFIX as string | undefined) ?? "/api/v1/auth";

function gatewayUrl(path: string): string {
  const prefix = GATEWAY_PREFIX.startsWith("/") ? GATEWAY_PREFIX : `/${GATEWAY_PREFIX}`;
  return `${GATEWAY_BASE}${prefix}${path.startsWith("/") ? path : `/${path}`}`;
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
  // Gateway register schema still asks for tenant_id; send a neutral default
  // so signup works without any local tenant config. Login never needs this.
  const data = await gatewayPost("/register", {
    email,
    password,
    display_name: displayName,
    tenant_id: "default",
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
