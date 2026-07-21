/* Mirrors backend/app/routes/auth.py */
import { apiGet } from "./client";

export type CurrentUserOut = {
  has_account: boolean;
  organisation_id: string | null;
  workspace_id: string | null;
};

/* Looks up whether the currently-authenticated Firebase account (the token
 * client.ts already attaches to every request) already has an app_user row
 * - and if so, which organisation/workspace to restore the session to,
 * instead of relying on this browser's localStorage (lib/session.ts),
 * which knows nothing about which Firebase account is actually logged in. */
export function getCurrentUser(): Promise<CurrentUserOut> {
  return apiGet<CurrentUserOut>("/auth/me");
}
