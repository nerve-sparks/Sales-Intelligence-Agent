/* Gateway JWT storage. Access token is sent as Authorization: Bearer on
 * every API call; refresh token is kept for logout / future rotation. */

const ACCESS_KEY = "auth_token";
const REFRESH_KEY = "refresh_token";

export type AuthUser = {
  uid: string;
  email: string | null;
};

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setAuthTokens(accessToken: string, refreshToken?: string | null): void {
  localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) {
    localStorage.setItem(REFRESH_KEY, refreshToken);
  }
  window.dispatchEvent(new Event("auth-changed"));
}

export function clearAuthTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  window.dispatchEvent(new Event("auth-changed"));
}

/** Unverified decode of JWT payload for UI identity (email/sub). Backend verifies. */
export function decodeAccessToken(token: string | null = getAccessToken()): AuthUser | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as Record<string, unknown>;
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!sub) return null;
    const email =
      typeof payload.email === "string"
        ? payload.email
        : typeof payload.preferred_username === "string" && payload.preferred_username.includes("@")
          ? payload.preferred_username
          : null;
    return { uid: sub, email };
  } catch {
    return null;
  }
}

export function getAuthUser(): AuthUser | null {
  return decodeAccessToken(getAccessToken());
}
