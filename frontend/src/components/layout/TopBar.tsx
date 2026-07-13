import { Scan, Search } from "lucide-react";
import type { ComponentType } from "react";
import {
  AIAssistantButton,
  DetectionPill,
  NotificationBell,
  UserMenu,
} from "./TopActions";

/* Shared application top bar: search + detection status + account actions. */
export function TopBar({
  searchPlaceholder = "Search companies, signals, executives...",
  detectionIcon = Scan,
  showDetection = true,
}: {
  searchPlaceholder?: string;
  detectionIcon?: ComponentType<{ className?: string }>;
  showDetection?: boolean;
}) {
  return (
    <header className="flex h-[88px] shrink-0 items-center gap-[16px] border-b border-[#e9edf5] bg-white px-[24px]">
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
        <AIAssistantButton />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
