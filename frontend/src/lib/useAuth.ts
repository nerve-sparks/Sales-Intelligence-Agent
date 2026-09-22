import { useEffect, useState } from "react";
import { getAuthUser, type AuthUser } from "./authToken";

/* Tracks whether a gateway JWT is present in localStorage. Re-reads on
 * auth-changed (login/logout) and storage events from other tabs. */
export function useAuth(): { user: AuthUser | null; loading: boolean } {
  const [user, setUser] = useState<AuthUser | null>(() => getAuthUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sync = () => {
      setUser(getAuthUser());
      setLoading(false);
    };
    sync();
    window.addEventListener("auth-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("auth-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { user, loading };
}
