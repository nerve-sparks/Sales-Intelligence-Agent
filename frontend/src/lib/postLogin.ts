import { getCurrentUser } from "../api/auth";
import { setOrganisationId, setWorkspaceId } from "./session";

/* Where a just-authenticated Firebase user should land - looks up the real
 * backend record (GET /auth/me) instead of trusting this browser's cached
 * session, which knows nothing about which Firebase account is actually
 * logged in and is empty on any browser/profile that hasn't onboarded
 * locally before. Populates session.ts when a real account is found so
 * every workspace-scoped page downstream keeps working exactly as before. */
export async function resolvePostLoginPath(): Promise<"/dashboard" | "/onboarding"> {
  try {
    const current = await getCurrentUser();
    if (current.has_account && current.organisation_id) {
      setOrganisationId(current.organisation_id);
      if (current.workspace_id) {
        setWorkspaceId(current.workspace_id);
      }
      return "/dashboard";
    }
  } catch {
    // Backend unreachable, or the ID token isn't valid yet - fall through
    // to onboarding rather than leaving the caller stuck.
  }
  return "/onboarding";
}
