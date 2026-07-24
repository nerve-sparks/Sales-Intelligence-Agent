import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
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
  // Re-runs the lookup on demand - the provider otherwise only re-fetches
  // when workspaceId itself changes, so an edit made elsewhere (Settings'
  // Organization panel changing your own designation) would never reach the
  // already-mounted TopBar without this - see SettingsIcpDataPage.tsx's
  // OrganizationPanel.save(), which calls this after a successful save.
  refresh: () => void;
};

const CurrentUserContext = createContext<CurrentUserContextValue>({ user: null, refresh: () => {} });

/* Resolves "who is the logged-in person" exactly once per app load, mounted
 * above the router in App.tsx - not inside TopBar. Every page used to render
 * its own <TopBar>, so client-side navigation between pages unmounted and
 * remounted TopBar's own user-lookup state on every single route change,
 * resetting it to null and flashing UserMenu's hardcoded "Arjun Kumar/
 * Founder" placeholder before the real name loaded back in each time. Doing
 * the lookup once here means that flash only happens once per full page
 * load, not once per navigation. */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  // Seeded from session at mount, but re-checked below on every route change
  // too - onboarding finishing writes a workspace_id via a client-side
  // navigate() (no reload) straight to /dashboard, and this provider mounts
  // once, above the router, before that happens. Without re-checking on
  // navigation this would only ever see the pre-onboarding "no workspace yet"
  // state and never look the user up at all.
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
            // Show the designation the user entered during onboarding (and
            // can edit in Settings); fall back to the workspace role only if
            // unset.
            role: me.designation?.trim() || roleLabel(me.role),
          });
        }
      })
      .catch(() => {
        // No backend/workspace yet - keep the dummy defaults.
      });
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    // Firebase restores the signed-in user asynchronously, and the API client
    // only attaches a bearer token when auth.currentUser exists (see
    // api/client.ts). Waiting for onAuthStateChanged guarantees both the
    // request is authenticated AND we can match the caller by email (same as
    // the Settings profile panel) instead of guessing the owner.
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      loadUser(fbUser?.email ?? undefined, workspaceId);
    });
    return unsubscribe;
  }, [workspaceId, loadUser]);

  // On-demand refresh - by the time anything calls this, we're already
  // logged in (this only fires from an authenticated page like Settings),
  // so reading auth.currentUser directly is fine without waiting on
  // onAuthStateChanged again.
  const refresh = useCallback(() => {
    if (!workspaceId) {
      return;
    }
    loadUser(auth.currentUser?.email ?? undefined, workspaceId);
  }, [workspaceId, loadUser]);

  return (
    <CurrentUserContext.Provider value={{ user, refresh }}>{children}</CurrentUserContext.Provider>
  );
}

/* null until the lookup above resolves (or if there's no workspace yet) -
 * callers (UserMenu via TopBar) fall back to their own placeholder props in
 * that case, same as before. */
export function useCurrentUser(): CurrentUser | null {
  return useContext(CurrentUserContext).user;
}

/* Call after saving a change that affects how the current user is displayed
 * (name/designation) so the shared TopBar picks it up immediately instead of
 * only on the next full page load. */
export function useRefreshCurrentUser(): () => void {
  return useContext(CurrentUserContext).refresh;
}
