import { Building2, Check, ChevronDown, Scan, Search } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  DetectionPill,
  NotificationBell,
  UserMenu,
} from "./TopActions";
import { listWorkspaceMembers, listWorkspaces, type WorkspaceOut } from "../../api/workspaces";
import { getOrganisationId, getWorkspaceId, setWorkspaceId } from "../../lib/session";

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

/* Shared application top bar: search + detection status + account actions. */
export function TopBar({
  searchPlaceholder = "Search companies, signals, executives...",
  detectionIcon = Scan,
  showDetection = true,
  showNotificationBell = true,
  showWorkspaceSwitcher = false,
}: {
  searchPlaceholder?: string;
  detectionIcon?: ComponentType<{ className?: string }>;
  showDetection?: boolean;
  showNotificationBell?: boolean;
  showWorkspaceSwitcher?: boolean;
}) {
  // Workspace owner is the person who created it (see OnboardingPage's
  // Workspace Setup step: addWorkspaceMember(..., { role: "owner" })).
  // UserMenu keeps its "Arjun Kumar" / "Founder" defaults until this loads
  // or if there's no backend/workspace yet.
  const [user, setUser] = useState<{ initials: string; name: string; role: string } | null>(null);

  useEffect(() => {
    const workspaceId = getWorkspaceId();
    if (!workspaceId) {
      return;
    }
    listWorkspaceMembers(workspaceId)
      .then((members) => {
        const owner = members.find((m) => m.role === "owner") ?? members[0];
        if (owner?.full_name) {
          setUser({ initials: initialsOf(owner.full_name), name: owner.full_name, role: roleLabel(owner.role) });
        }
      })
      .catch(() => {
        // No backend/workspace yet - keep the dummy defaults.
      });
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-[88px] shrink-0 items-center gap-[16px] border-b border-[#e9edf5] bg-white px-[24px]">
      <div className="relative w-full max-w-[500px]">
        <Search className="pointer-events-none absolute left-[18px] top-1/2 size-[18px] -translate-y-1/2 text-[#94a3b8]" />
        <input
          className="h-[48px] w-full rounded-[12px] border border-[#e9edf5] bg-[#f8fafc] pl-[46px] pr-[52px] text-[14px] text-[#0f172a] outline-none placeholder:text-[#94a3b8] focus:border-[#cbd5e1]"
          placeholder={searchPlaceholder}
          type="search"
        />
        <span className="absolute right-[14px] top-1/2 -translate-y-1/2 rounded-[6px] border border-[#e2e8f0] bg-white px-[7px] py-[3px] text-[11px] font-semibold text-[#94a3b8]">
          ⌘K
        </span>
      </div>

      {showWorkspaceSwitcher && <WorkspaceSwitcher />}

      {showDetection && (
        <DetectionPill className="hidden xl:flex" icon={detectionIcon} />
      )}

      <div className="ml-auto flex items-center gap-[12px]">
        {showNotificationBell && <NotificationBell />}
        <UserMenu {...(user ?? {})} />
      </div>
    </header>
  );
}
