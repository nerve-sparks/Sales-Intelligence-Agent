import { Building2, Check, ChevronDown, Scan } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  DetectionPill,
  NotificationBell,
  UserMenu,
} from "./TopActions";
import { listWorkspaceMembers, listWorkspaces, type WorkspaceOut } from "../../api/workspaces";
import { getOrganisationId, getWorkspaceId, setWorkspaceId } from "../../lib/session";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../lib/firebase";

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

/* One Organisation can have many Workspaces (department-level - Sales,
 * Marketing, etc). Hidden entirely when there's only one to pick from -
 * nothing to switch between. Switching writes the new workspace_id to
 * session (lib/session.ts) and reloads, since every workspace-scoped page
 * on the site reads that value fresh on mount rather than through any
 * shared/global state - see also the fuller create/switch UI on the
 * Settings page (SettingsIcpDataPage's WorkspacesPanel). */
function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState<WorkspaceOut[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentWorkspaceId = getWorkspaceId();

  useEffect(() => {
    const organisationId = getOrganisationId();
    if (!organisationId) return;
    listWorkspaces(organisationId)
      .then(setWorkspaces)
      .catch(() => setWorkspaces([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onOutsideClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  if (workspaces.length <= 1) {
    return null;
  }

  const current = workspaces.find((w) => w.workspace_id === currentWorkspaceId);

  const switchTo = (id: string) => {
    setOpen(false);
    if (id === currentWorkspaceId) return;
    setWorkspaceId(id);
    window.location.reload();
  };

  return (
    <div className="relative hidden lg:block" ref={rootRef}>
      <button
        className="flex h-[46px] items-center gap-[8px] rounded-[12px] border border-[#e9edf5] bg-white px-[14px] text-[14px] font-semibold text-[#334155]"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <Building2 className="size-[16px] text-[#64748b]" />
        <span className="max-w-[140px] truncate">{current?.workspace_name ?? "Workspace"}</span>
        <ChevronDown className="size-[14px] text-[#94a3b8]" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-20 w-[220px] rounded-[10px] border border-[#e9edf5] bg-white py-[6px] shadow-[0px_8px_20px_rgba(15,23,42,0.12)]">
          {workspaces.map((w) => (
            <button
              className="flex w-full items-center justify-between gap-[8px] px-[14px] py-[9px] text-left text-[13px] font-medium text-[#334155] hover:bg-[#f8fafc]"
              key={w.workspace_id}
              onClick={() => switchTo(w.workspace_id)}
              type="button"
            >
              <span className="truncate">{w.workspace_name}</span>
              {w.workspace_id === currentWorkspaceId && (
                <Check className="size-[14px] shrink-0 text-[#005bff]" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Shared application top bar: detection status + account actions. */
export function TopBar({
  detectionIcon = Scan,
  showDetection = true,
  showNotificationBell = true,
  showWorkspaceSwitcher = false,
}: {
  // Retained (accepted but unused) so the many existing call sites that still
  // pass it keep type-checking — the search box itself has been removed.
  searchPlaceholder?: string;
  detectionIcon?: ComponentType<{ className?: string }>;
  showDetection?: boolean;
  showNotificationBell?: boolean;
  showWorkspaceSwitcher?: boolean;
}) {
  // UserMenu keeps its "Arjun Kumar" / "Founder" defaults until this loads
  // or if there's no backend/workspace yet.
  const [user, setUser] = useState<{ initials: string; name: string; role: string } | null>(null);

  useEffect(() => {
    const workspaceId = getWorkspaceId();
    if (!workspaceId) {
      return;
    }
    // Firebase restores the signed-in user asynchronously, and the API client
    // only attaches a bearer token when auth.currentUser exists (see
    // api/client.ts). Waiting for onAuthStateChanged guarantees both the
    // request is authenticated AND we can match the caller by email (same as
    // the Settings profile panel) instead of guessing the owner.
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      const email = fbUser?.email;
      listWorkspaceMembers(workspaceId)
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
    });
    return unsubscribe;
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-[88px] shrink-0 items-center gap-[16px] border-b border-[#e9edf5] bg-white px-[24px]">
      {showWorkspaceSwitcher && <WorkspaceSwitcher />}

      <div className="ml-auto flex items-center gap-[12px]">
        {showDetection && (
          <DetectionPill className="hidden xl:flex" icon={detectionIcon} />
        )}
        {showNotificationBell && <NotificationBell />}
        <UserMenu {...(user ?? {})} />
      </div>
    </header>
  );
}
