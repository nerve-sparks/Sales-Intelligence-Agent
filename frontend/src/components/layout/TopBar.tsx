import { Scan, Search } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import {
  AIAssistantButton,
  DetectionPill,
  NotificationBell,
  UserMenu,
} from "./TopActions";
import { listWorkspaceMembers } from "../../api/workspaces";
import { getWorkspaceId } from "../../lib/session";

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

/* Shared application top bar: search + detection status + account actions. */
export function TopBar({
  searchPlaceholder = "Search companies, signals, executives...",
  detectionIcon = Scan,
  showDetection = true,
  showAIAssistant = true,
  showNotificationBell = true,
}: {
  searchPlaceholder?: string;
  detectionIcon?: ComponentType<{ className?: string }>;
  showDetection?: boolean;
  showAIAssistant?: boolean;
  showNotificationBell?: boolean;
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

      {showDetection && (
        <DetectionPill className="hidden xl:flex" icon={detectionIcon} />
      )}

      <div className="ml-auto flex items-center gap-[12px]">
        {showAIAssistant && <AIAssistantButton />}
        {showNotificationBell && <NotificationBell />}
        <UserMenu {...(user ?? {})} />
      </div>
    </header>
  );
}
