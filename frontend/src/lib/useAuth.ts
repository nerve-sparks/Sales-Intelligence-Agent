import { useEffect, useState } from "react";
import { getAuthUser, type AuthUser } from "./authToken";

/* Tracks whether a gateway JWT is present in localStorage. Re-reads on
 * auth-changed (login/logout) and storage events from other tabs. */
export function useAuth(): { user: AuthUser | null; loading: boolean } {
  const [user, setUser] = useState<AuthUser | null>(() => getAuthUser());

  useEffect(() => {
    const sync = () => setUser(getAuthUser());
    sync();
    window.addEventListener("auth-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("auth-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Never "loading": the token is read synchronously from localStorage in the
  // state initializer above, so the answer is already known on the very first
  // render. Starting at loading=true instead made RequireAuth paint a
  // full-screen "Loading..." panel for one frame on EVERY client-side
  // navigation (it remounts per route), which is what made sidebar navigation
  // flash white before the page appeared. Kept in the return shape because
  // callers destructure it.
  return { user, loading: false };
}
