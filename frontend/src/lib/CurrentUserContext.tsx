import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getCurrentUser } from "../api/auth";
import { getAuthUser } from "./authToken";

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

/* Shown until /auth/me returns a name (e.g. mid-onboarding, before the
 * app_user row exists, or when "Your Name" was left blank): the signed-in
 * gateway account's own email - never a made-up person. */
function fallbackUser(email: string | null | undefined, designation?: string | null): CurrentUser | null {
  const address = email ?? getAuthUser()?.email ?? null;
  if (!address) return null;
  return {
    initials: initialsOf(address.split("@")[0].replace(/[._-]+/g, " ")),
    name: address,
    role: designation?.trim() || "Member",
  };
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
  const [user, setUser] = useState<CurrentUser | null>(() => fallbackUser(null));

  const loadUser = useCallback(() => {
    getCurrentUser()
      .then((current) => {
        const fullName = current.full_name?.trim();
        setUser(
          fullName
            ? {
                initials: initialsOf(fullName),
                name: fullName,
                role: current.designation?.trim() || "Member",
              }
            : fallbackUser(current.email, current.designation),
        );
      })
      .catch(() => {
        // Keep whatever is shown, but switch accounts correctly on sign-in/out.
        setUser((prev) => prev ?? fallbackUser(null));
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
