import { getCurrentUser } from "../api/auth";
import { setOrganisationId, setWorkspaceId } from "./session";

/* Where a just-authenticated gateway user should land - looks up the real
 * backend record (GET /auth/me) instead of trusting this browser's cached
 * session. Populates session.ts when a real account is found. */
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
    // Backend unreachable or token not accepted yet - fall through to onboarding.
  }
  return "/onboarding";
}
