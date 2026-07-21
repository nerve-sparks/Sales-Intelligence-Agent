import { signOut } from "firebase/auth";
import { Bell, ChevronDown, LogOut, Scan, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../../lib/cn";
import { auth } from "../../lib/firebase";
import { clearSession } from "../../lib/session";

/* Reusable header/top-bar controls shared across feature pages. */

export function DetectionPill({
  icon: Icon = Scan,
  className = "",
}: {
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-[10px] rounded-[12px] border border-[#e9edf5] bg-white px-[16px] py-[9px]",
        className,
      )}
    >
      <span className="relative flex size-[8px] items-center justify-center">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#22c55e] opacity-60" />
        <span className="relative inline-flex size-[8px] rounded-full bg-[#16a34a]" />
      </span>
      <div className="leading-tight">
        <p className="m-0 text-[13px] font-bold text-[#0f172a]">
          Detection Engine Active
        </p>
        <p className="m-0 text-[12px] text-[#64748b]">
          128 sources scanning in real-time
        </p>
      </div>
      <Icon className="ml-[6px] size-[18px] text-[#94a3b8]" />
    </div>
  );
}

export function AIAssistantButton() {
  return (
    <button
      className="flex items-center gap-[8px] rounded-[12px] border border-[#e9edf5] bg-white px-[16px] py-[11px] text-[14px] font-semibold text-[#005bff]"
      type="button"
    >
      <Sparkles className="size-[18px] text-[#7c3aed]" />
      <span className="hidden sm:inline">AI Assistant</span>
    </button>
  );
}

export function NotificationBell({ count = 12 }: { count?: number }) {
  return (
    <button
      aria-label="Notifications"
      className="relative flex size-[46px] items-center justify-center rounded-[12px] border border-[#e9edf5] bg-white"
      type="button"
    >
      <Bell className="size-[19px] text-[#64748b]" />
      <span className="absolute -right-[6px] -top-[6px] flex min-w-[20px] items-center justify-center rounded-full bg-[#ef4444] px-[5px] text-[11px] font-bold text-white">
        {count}
      </span>
    </button>
  );
}

export function UserMenu({
  initials = "AK",
  name = "Arjun Kumar",
  role = "Founder",
}: {
  initials?: string;
  name?: string;
  role?: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut(auth);
    } finally {
      // Clear regardless of whether signOut itself succeeded - staying
      // signed in with a stale cached org/workspace is worse than a
      // redundant clear.
      clearSession();
      navigate("/", { replace: true });
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        className="flex items-center gap-[10px] rounded-[12px] py-[6px] pl-[6px] pr-[10px] transition hover:bg-[#f6f7fb]"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className="flex size-[38px] items-center justify-center rounded-full bg-[#0f172a] text-[13px] font-bold text-white">
          {initials}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[14px] font-bold text-[#0f172a]">{name}</span>
          <span className="block text-[12px] text-[#64748b]">{role}</span>
        </span>
        <ChevronDown className="size-[16px] text-[#94a3b8]" />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-[200px] rounded-[10px] border border-[#e9edf5] bg-white py-[6px] shadow-[0px_8px_20px_rgba(15,23,42,0.12)]">
          <div className="border-b border-[#eef1f6] px-[14px] py-[9px]">
            <p className="m-0 truncate text-[13px] font-bold text-[#0f172a]">{name}</p>
            <p className="m-0 text-[12px] text-[#64748b]">{role}</p>
          </div>
          <button
            className="flex w-full items-center gap-[8px] px-[14px] py-[9px] text-left text-[13px] font-medium text-[#ef4444] hover:bg-[#fef2f2] disabled:opacity-60"
            disabled={loggingOut}
            onClick={handleLogout}
            type="button"
          >
            <LogOut className="size-[15px]" />
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>
      )}
    </div>
  );
}

/* Convenience grouping used by pages without a search bar in the header. */
export function TopActions({
  detectionIcon,
}: {
  detectionIcon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-[12px]">
      <DetectionPill className="hidden md:flex" icon={detectionIcon} />
      <AIAssistantButton />
      <NotificationBell />
      <UserMenu />
    </div>
  );
}
