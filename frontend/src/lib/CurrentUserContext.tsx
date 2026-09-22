import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { getAuthUser } from "./authToken";
import { getWorkspaceId } from "./session";
import { listWorkspaceMembers } from "../api/workspaces";

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

function roleLabel(role: string): string {
  return role === "owner" ? "Founder" : role.charAt(0).toUpperCase() + role.slice(1);
}

type CurrentUserContextValue = {
  user: CurrentUser | null;
  refresh: () => void;
};

const CurrentUserContext = createContext<CurrentUserContextValue>({ user: null, refresh: () => {} });

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(() => getWorkspaceId());
  const location = useLocation();

  useEffect(() => {
    const current = getWorkspaceId();
    if (current !== workspaceId) {
      setWorkspaceIdState(current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const loadUser = useCallback((email: string | undefined, forWorkspaceId: string) => {
    listWorkspaceMembers(forWorkspaceId)
      .then((members) => {
        const me =
          members.find((m) => m.email === email) ??
          members.find((m) => m.role === "owner") ??
          members[0];
        if (me?.full_name) {
          setUser({
            initials: initialsOf(me.full_name),
            name: me.full_name,
            role: me.designation?.trim() || roleLabel(me.role),
          });
        }
      })
      .catch(() => {
        /* keep placeholders */
      });
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    const sync = () => {
      const authUser = getAuthUser();
      loadUser(authUser?.email ?? undefined, workspaceId);
    };
    sync();
    window.addEventListener("auth-changed", sync);
    return () => window.removeEventListener("auth-changed", sync);
  }, [workspaceId, loadUser]);

  const refresh = useCallback(() => {
    if (!workspaceId) {
      return;
    }
    loadUser(getAuthUser()?.email ?? undefined, workspaceId);
  }, [workspaceId, loadUser]);

  return (
    <CurrentUserContext.Provider value={{ user, refresh }}>{children}</CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): CurrentUser | null {
  return useContext(CurrentUserContext).user;
}

export function useRefreshCurrentUser(): () => void {
  return useContext(CurrentUserContext).refresh;
}
