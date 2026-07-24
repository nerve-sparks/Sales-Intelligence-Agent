import { Building2, Check, ChevronDown, Scan } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  DetectionPill,
  NotificationBell,
  UserMenu,
} from "./TopActions";
import { listWorkspaces, type WorkspaceOut } from "../../api/workspaces";
import { getOrganisationId, getWorkspaceId, setWorkspaceId } from "../../lib/session";
import { useCurrentUser } from "../../lib/CurrentUserContext";

/* One Organisation can have many Workspaces (department-level - Sales,
 * Marketing, etc). Always shows the current workspace as a button, even
 * with only one on the account, so it's clear which workspace you're in -
 * the dropdown of alternates to switch between only appears once there's
 * actually more than one. Switching writes the new workspace_id to session
 * (lib/session.ts) and reloads, since every workspace-scoped page on the
 * site reads that value fresh on mount rather than through any shared/
 * global state - see also the fuller create/switch UI on the Settings page
 * (SettingsIcpDataPage's WorkspacesPanel). */
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

  if (workspaces.length === 0) {
    return null;
  }

  const hasMultiple = workspaces.length > 1;
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
        className="flex h-[46px] items-center gap-[8px] rounded-[12px] border border-[#e9edf5] bg-white px-[14px] text-[14px] font-semibold text-[#334155] disabled:cursor-default"
        disabled={!hasMultiple}
        onClick={() => hasMultiple && setOpen((o) => !o)}
        type="button"
      >
        <Building2 className="size-[16px] text-[#64748b]" />
        <span className="max-w-[140px] truncate">{current?.workspace_name ?? "Workspace"}</span>
        {hasMultiple && <ChevronDown className="size-[14px] text-[#94a3b8]" />}
      </button>

      {open && hasMultiple && (
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
  // Resolved once, above the router (see lib/CurrentUserContext.tsx) - not
  // re-fetched on every page navigation. UserMenu keeps its "Arjun Kumar" /
  // "Founder" defaults until this resolves, or if there's no workspace yet.
  const user = useCurrentUser();

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
