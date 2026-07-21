import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../lib/useAuth";

/* Wraps every non-auth route (see App.tsx) - unauthenticated visitors get
 * bounced to "/" (LoginPage), which itself covers login/signup/forgot/mfa.
 * Firebase's auth state takes a moment to resolve on first load (it's
 * reading IndexedDB/localStorage async), so there's a brief loading state
 * rather than redirecting before we actually know. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white font-['Inter'] text-[14px] text-[#64748b]">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate replace to="/" />;
  }

  return <>{children}</>;
}
