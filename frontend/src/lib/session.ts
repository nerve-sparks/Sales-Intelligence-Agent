/* Lightweight localStorage-backed "current session" - there's no auth yet,
 * so organisation_id/workspace_id are established once during onboarding
 * and read back by every other page that needs them. */

const ORG_KEY = "xsparks_organisation_id";
const WORKSPACE_KEY = "xsparks_workspace_id";

export function getOrganisationId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(ORG_KEY);
}

export function setOrganisationId(id: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ORG_KEY, id);
}

export function getWorkspaceId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(WORKSPACE_KEY);
}

export function setWorkspaceId(id: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(WORKSPACE_KEY, id);
}

/* Called on logout - without this, the next Firebase sign-in on this same
 * browser would inherit the previous account's organisation_id/workspace_id
 * (RequireOnboarding only checks whether *a* org id is cached, not whether
 * it belongs to whoever just logged in). */
export function clearSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(ORG_KEY);
  window.localStorage.removeItem(WORKSPACE_KEY);
}
