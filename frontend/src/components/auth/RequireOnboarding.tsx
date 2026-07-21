import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getOrganisationId } from "../../lib/session";

/* Wraps every route except /onboarding itself (see App.tsx) - a logged-in
 * Firebase user with no organisation yet (fresh signup, or session.ts
 * cleared/never populated) gets bounced to onboarding instead of rendering
 * a page whose data fetches all silently no-op for a missing org_id. */
export function RequireOnboarding({ children }: { children: ReactNode }) {
  if (!getOrganisationId()) {
    return <Navigate replace to="/onboarding" />;
  }

  return <>{children}</>;
}
