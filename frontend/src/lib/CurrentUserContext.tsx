import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getCurrentUser } from "../api/auth";

export type CurrentUser = {
  initials: string;
  name: string;
  role: string;
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

type CurrentUserContextValue = {
  user: CurrentUser | null;
  refresh: () => void;
};

const CurrentUserContext = createContext<CurrentUserContextValue>({ user: null, refresh: () => {} });

/* Identity comes from GET /auth/me - resolved server-side from the caller's
 * OWN app_user row via the verified JWT, never from a workspace's member
 * list. Previously this searched listWorkspaceMembers(activeWorkspaceId) for
 * an email match, which meant switching to a workspace the logged-in user
 * isn't a member of silently displayed a DIFFERENT person (that workspace's
 * owner, or its first member) in the TopBar - your own name and designation
 * must never depend on which workspace happens to be active. */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);

  const loadUser = useCallback(() => {
    getCurrentUser()
      .then((current) => {
        if (current.full_name) {
          setUser({
            initials: initialsOf(current.full_name),
            name: current.full_name,
            role: current.designation?.trim() || "Member",
          });
        }
      })
      .catch(() => {
        /* keep placeholders */
      });
  }, []);

  useEffect(() => {
    loadUser();
    window.addEventListener("auth-changed", loadUser);
    return () => window.removeEventListener("auth-changed", loadUser);
  }, [loadUser]);

  return (
    <CurrentUserContext.Provider value={{ user, refresh: loadUser }}>{children}</CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): CurrentUser | null {
  return useContext(CurrentUserContext).user;
}

export function useRefreshCurrentUser(): () => void {
  return useContext(CurrentUserContext).refresh;
}
