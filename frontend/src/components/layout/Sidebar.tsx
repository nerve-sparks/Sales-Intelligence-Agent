import {
  ChevronRight,
  Contact,
  Home,
  Radio,
  Settings,
  Target,
  // Zap,  // re-add with the Trigger Intelligence nav item below
} from "lucide-react";
import { useState, type ComponentType, type ReactNode } from "react";
import { Link } from "react-router-dom";
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
  // Trigger Intelligence hidden from nav - the /trigger-library, /trigger-details
  // and /trigger-editor routes still exist and work if reached directly.
  // { icon: Zap, label: "Trigger Intelligence", href: "/trigger-library" },
  {
    // No href: a group with children is a disclosure toggle, so clicking it
    // opens/closes the sub-items rather than navigating. Its own overview page
    // moves into the list as "Overview" - the sidebar is the only route to
    // /signal-intelligence, so without that entry the page is unreachable.
    icon: Radio,
    label: "Signal Intelligence",
    children: [
      { label: "Overview", href: "/signal-intelligence" },
      { label: "Signal Feed", href: "/signal-feed" },
      { label: "Signal Analytics", href: "/signal-analytics" },
    ],
  },
  { icon: Contact, label: "Enterprise List", href: "/enterprise-list" },
  // ICP defines who is worth targeting; it deliberately has no effect on how
  // companies are scored (see features/icp/IcpPage.tsx).
  { icon: Target, label: "ICP", href: "/icp" },
];

const settingsItem: NavEntry = { icon: Settings, label: "Settings", href: "/settings" };

/* whitespace-nowrap: labels like "Signal Intelligence" must stay on one line.
   In a row flex with an icon and a trailing chevron the label is the only
   flexible item, so without this it wraps to a second line as soon as the
   fixed elements leave it short - a width bump alone would only postpone that
   until the next long label. */
const itemClass = (isActive: boolean) =>
  cn(
    "flex items-center gap-[12px] whitespace-nowrap rounded-[10px] px-[13px] py-[10px] text-[14px] transition",
    isActive
      ? "bg-[#fff1e6] font-semibold text-[#0f172a]"
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
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(className, "no-underline")}
      to={href}
    >
      {children}
    </Link>
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
  /* Which nav groups are expanded. The group you're currently inside starts
     open so landing on Signal Feed shows its siblings; everything else starts
     closed. Keyed by label rather than a single "openGroup" so opening one
     group never force-closes another if more groups gain children later. */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
    [active]: true,
  }));

  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  return (
    <aside className="sticky top-0 hidden h-screen w-[268px] shrink-0 self-start overflow-y-auto border-r border-[#e9edf5] bg-white lg:flex lg:flex-col">
      <div className="flex h-[88px] shrink-0 items-center border-b border-[#e9edf5] px-[22px]">
        <FigmaLogo />
      </div>

      <nav className="flex flex-1 flex-col gap-[3px] px-[14px] py-[18px]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.label === active;
          const hasChildren = Boolean(item.children?.length);
          const isOpen = hasChildren && Boolean(openGroups[item.label]);

          const iconEl = (
            <Icon
              className={cn(
                "size-[19px] shrink-0",
                isActive ? "text-[#f97316]" : "text-[#94a3b8]",
              )}
              strokeWidth={2}
            />
          );

          return (
            <div key={item.label}>
              {hasChildren ? (
                /* A group toggles its sub-items open/closed on each click
                   instead of navigating - its own page lives in the list as
                   "Overview". The chevron rotates rather than swapping icons,
                   so the open/close state animates instead of snapping. */
                <button
                  aria-expanded={isOpen}
                  className={cn(itemClass(isActive), "w-full text-left")}
                  onClick={() => toggleGroup(item.label)}
                  type="button"
                >
                  {iconEl}
                  {item.label}
                  <ChevronRight
                    aria-hidden="true"
                    className={cn(
                      "ml-auto size-[15px] shrink-0 text-[#94a3b8] transition-transform duration-200",
                      isOpen && "rotate-90",
                    )}
                  />
                </button>
              ) : (
                <NavLink className={itemClass(isActive)} href={item.href} isActive={isActive}>
                  {iconEl}
                  {item.label}
                </NavLink>
              )}

              {/* A connector rail groups the sub-items under their parent: it
                  sits on the parent's icon centre (22px), and the active page
                  marks itself on that rail rather than with a bullet, which
                  read as decoration rather than state. */}
              {isOpen && (
                <div className="relative mt-[3px] flex flex-col gap-[1px] pb-[5px] pl-[32px]">
                  <span
                    aria-hidden="true"
                    className="absolute bottom-[7px] left-[22px] top-[3px] w-[2px] rounded-full bg-[#eef1f6]"
                  />
                  {item.children?.map((child) => {
                    const subActive = child.label === activeSub;

                    return (
                      <NavLink
                        className={cn(
                          "relative flex items-center whitespace-nowrap rounded-[8px] px-[12px] py-[7px] text-[13px] transition",
                          subActive
                            ? "bg-[#fff1e6] font-semibold text-[#0f172a]"
                            : "font-medium text-[#64748b] hover:bg-[#f6f7fb] hover:text-[#334155]",
                        )}
                        href={child.href}
                        isActive={subActive}
                        key={child.label}
                      >
                        {subActive && (
                          <span
                            aria-hidden="true"
                            className="absolute -left-[10px] top-1/2 h-[18px] w-[2px] -translate-y-1/2 rounded-full bg-[#f97316]"
                          />
                        )}
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

        <NavLink
          className={itemClass(active === settingsItem.label)}
          href={settingsItem.href}
          isActive={active === settingsItem.label}
        >
          <Settings
            className={cn(
              "size-[19px] shrink-0",
              active === settingsItem.label ? "text-[#f97316]" : "text-[#94a3b8]",
            )}
            strokeWidth={2}
          />
          {settingsItem.label}
        </NavLink>
      </nav>
    </aside>
  );
}
