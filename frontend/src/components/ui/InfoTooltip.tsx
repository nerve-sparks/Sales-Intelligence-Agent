import { Info } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "../../lib/cn";

/* Info tooltip for card headings.
 *
 * Replaces the bare <Info /> icons that were scattered across the app purely as
 * decoration - twelve of them, none with any explanation attached, so the
 * universal "there is more to know here" affordance told you nothing.
 *
 * Hover AND focus both open it, and the trigger is a real <button> with
 * aria-describedby, so it is reachable by keyboard rather than mouse-only.
 * Escape closes it.
 *
 * `tone="dark"` inverts the colours for placement on a dark card (the
 * dashboard's Lead Opportunity Map), where the default light bubble is invisible.
 */
export function InfoTooltip({
  text,
  tone = "light",
  side = "bottom",
  className,
}: {
  text: string;
  tone?: "light" | "dark";
  side?: "top" | "bottom";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className="relative inline-flex">
      <button
        aria-describedby={open ? id : undefined}
        aria-label="More information"
        className={cn(
          "inline-flex cursor-help items-center rounded-full outline-none transition",
          tone === "dark" ? "text-[#94a3b8] hover:text-white" : "text-[#cbd5e1] hover:text-[#64748b]",
          "focus-visible:ring-2 focus-visible:ring-[#5b3df5]/40",
          className,
        )}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          // Headings sit inside clickable rows on some pages - the tooltip must
          // not also trigger whatever the row does.
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        type="button"
      >
        <Info className="size-[14px]" />
      </button>

      {open && (
        <span
          className={cn(
            // w-max + max-w keeps short copy on one line without letting long
            // copy stretch off the card.
            "pointer-events-none absolute left-1/2 z-30 w-max max-w-[260px] -translate-x-1/2 rounded-[8px] px-[10px] py-[7px] text-[11px] font-normal leading-[16px] shadow-[0px_8px_20px_rgba(15,23,42,0.18)]",
            side === "top" ? "bottom-[calc(100%+7px)]" : "top-[calc(100%+7px)]",
            tone === "dark"
              ? "border border-white/10 bg-[#0f1729] text-[#cbd5e1]"
              : "border border-[#e9edf5] bg-white text-[#475569]",
          )}
          id={id}
          role="tooltip"
        >
          {text}
        </span>
      )}
    </span>
  );
}
