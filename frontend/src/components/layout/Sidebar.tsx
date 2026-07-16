import {
  ChevronDown,
  ChevronRight,
  Contact,
  Gauge,
  Home,
  Radio,
  Settings,
  Zap,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { FigmaLogo } from "../../features/auth/LoginPage";
import { cn } from "../../lib/cn";

type NavChild = { label: string; href?: string };

type NavEntry = {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  href?: string;
  children?: NavChild[];
};

const navItems: NavEntry[] = [
  { icon: Home, label: "Dashboard", href: "/dashboard" },
  { icon: Zap, label: "Trigger Intelligence", href: "/trigger-library" },
  {
    icon: Radio,
    label: "Signal Intelligence",
    href: "/signal-intelligence",
    children: [
      { label: "Signal Feed", href: "/signal-feed" },
      { label: "Signal Analytics", href: "/signal-analytics" },
    ],
  },
  { icon: Contact, label: "Enterprise List", href: "/enterprise-list" },
  { icon: Gauge, label: "Score Breakdown", href: "/score-breakdown" },
];

const itemClass = (isActive: boolean) =>
  cn(
    "flex items-center gap-[12px] rounded-[10px] px-[13px] py-[10px] text-[14px] transition",
    isActive
      ? "bg-[#eef1ff] font-semibold text-[#0f172a]"
      : "font-medium text-[#64748b] hover:bg-[#f6f7fb]",
  );

function NavLink({
  href,
  className,
  isActive,
  children,
}: {
  href?: string;
  className: string;
  isActive: boolean;
  children: ReactNode;
}) {
  return href ? (
    <a
      aria-current={isActive ? "page" : undefined}
      className={cn(className, "no-underline")}
      href={href}
    >
      {children}
    </a>
  ) : (
    <button className={className} type="button">
      {children}
    </button>
  );
}

export function Sidebar({
  active,
  activeSub,
}: {
  active: string;
  activeSub?: string;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 self-start overflow-y-auto border-r border-[#e9edf5] bg-white lg:flex lg:flex-col">
      <div className="flex h-[88px] shrink-0 items-center border-b border-[#e9edf5] px-[22px]">
        <FigmaLogo />
      </div>

      <nav className="flex flex-1 flex-col gap-[3px] px-[14px] py-[18px]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.label === active;
          const hasChildren = Boolean(item.children?.length);
          const expanded = isActive && hasChildren;
          const Chevron = expanded ? ChevronDown : ChevronRight;

          return (
            <div key={item.label}>
              <NavLink className={itemClass(isActive)} href={item.href} isActive={isActive}>
                <Icon
                  className={cn(
                    "size-[19px] shrink-0",
                    isActive ? "text-[#4f46e5]" : "text-[#94a3b8]",
                  )}
                  strokeWidth={2}
                />
                {item.label}
                {hasChildren && (
                  <Chevron className="ml-auto size-[15px] text-[#94a3b8]" />
                )}
              </NavLink>

              {expanded && (
                <div className="mt-[2px] flex flex-col gap-[2px] pb-[4px] pl-[24px]">
                  {item.children?.map((child) => {
                    const subActive = child.label === activeSub;

                    return (
                      <NavLink
                        className={cn(
                          "flex items-center gap-[10px] rounded-[8px] px-[12px] py-[8px] text-[13px] transition",
                          subActive
                            ? "bg-[#eef1ff] font-semibold text-[#4f46e5]"
                            : "font-medium text-[#64748b] hover:bg-[#f6f7fb]",
                        )}
                        href={child.href}
                        isActive={subActive}
                        key={child.label}
                      >
                        <span
                          className={cn(
                            "size-[7px] shrink-0 rounded-full",
                            subActive ? "bg-[#4f46e5]" : "bg-[#cbd5e1]",
                          )}
                        />
                        {child.label}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="my-[10px] h-px bg-[#e9edf5]" />

        <button
          className="flex items-center gap-[12px] rounded-[10px] px-[13px] py-[10px] text-[14px] font-medium text-[#64748b] transition hover:bg-[#f6f7fb]"
          type="button"
        >
          <Settings className="size-[19px] shrink-0 text-[#94a3b8]" strokeWidth={2} />
          Settings
        </button>
      </nav>
    </aside>
  );
}
