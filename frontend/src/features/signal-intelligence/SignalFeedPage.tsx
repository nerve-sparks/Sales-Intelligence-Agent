import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { cn } from "../../lib/cn";
import { listSignals, type SignalWithCompanyOut } from "../../api/signals";
import { getOrganisationId } from "../../lib/session";
import { categoryLabel, SIGNAL_CATEGORY_OPTIONS } from "../../lib/signalCategories";

/* Signal Feed shows ONLY real extracted signals from the /signals list
 * endpoint - each row's title/fact/category/type/confidence/company/time is
 * real. The old dummy rows, fake filter buttons (industry/geography/etc. -
 * no backing column), placeholder company logos/domains/sizes, and the
 * hardcoded pagination are removed. Category is the one real filter
 * (Signal.signal_category) and pagination is wired to the real total. */

const PAGE_SIZE = 20;

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function titleize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const LOGO_COLORS = ["#16a34a", "#2563eb", "#7c3aed", "#0d9488", "#ef4444", "#6366f1", "#10b981", "#3b82f6", "#334155", "#f97316"];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function initialsOf(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

const tagTones: Record<string, string> = {
  purple: "bg-[#f3e9ff] text-[#7c3aed]",
  gray: "bg-[#f1f5f9] text-[#64748b]",
};

function Tag({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-[6px] px-[10px] py-[4px] text-[12px] font-semibold", tagTones[tone])}>
      {label}
    </span>
  );
}

const intentTones: Record<string, string> = {
  High: "bg-[#f3e9ff] text-[#7c3aed]",
  Medium: "bg-[#fff1e3] text-[#f97316]",
  Low: "bg-[#eff6ff] text-[#2563eb]",
};

function IntentBadge({ level }: { level: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-[8px] px-[12px] py-[5px] text-[13px] font-semibold", intentTones[level])}>
      {level}
    </span>
  );
}

/* signal_category is the only filter dimension backed by a real column, wired
 * to the /signals list endpoint's ?category= param. */
function CategoryFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-medium text-[#334155]">
      <select
        className="cursor-pointer appearance-none bg-transparent pr-[18px] outline-none"
        onChange={(e) => onChange(e.target.value)}
        value={value}
      >
        <option value="">All Categories</option>
        {SIGNAL_CATEGORY_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {categoryLabel(option)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-[14px] size-[15px] text-[#94a3b8]" />
    </div>
  );
}

type Signal = {
  signalId: string;
  company: string;
  title: string;
  description: string;
  tags: { label: string; tone: string }[];
  intent: string;
  score: number;
  detected: string;
};

function toSignal(s: SignalWithCompanyOut): Signal {
  const confidence = s.signal_confidence ?? 0;
  const intent = confidence >= 0.6 ? "High" : confidence >= 0.4 ? "Medium" : "Low";
  return {
    signalId: s.signal_id,
    company: s.company_name,
    title: titleize(s.signal_type),
    description: s.core_fact ?? "—",
    tags: [
      { label: categoryLabel(s.signal_category), tone: "purple" },
      ...(s.is_action ? [{ label: "Action", tone: "gray" }] : []),
    ],
    intent,
    score: Math.round(confidence * 100),
    detected: relativeTime(s.ingested_at),
  };
}

const tableColumns = "grid-cols-[minmax(0,2.6fr)_minmax(0,1.2fr)_100px_120px_112px]";

function SignalTable({ signals }: { signals: Signal[] }) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-[#eef1f6] bg-white shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className={cn("grid items-center gap-[16px] border-b border-[#eef1f6] px-[24px] py-[15px] text-[13px] font-medium text-[#94a3b8]", tableColumns)}>
            <span>Signal</span>
            <span>Company</span>
            <span>Intent</span>
            <span>Intent Score</span>
            <span>Detected</span>
          </div>

          {signals.length === 0 ? (
            <div className="px-[24px] py-[48px] text-center text-[13px] text-[#94a3b8]">
              No signals yet. Upload a ZoomInfo export to extract signals.
            </div>
          ) : (
            <div className="divide-y divide-[#eef1f6]">
              {signals.map((signal) => (
                <div
                  className={cn("grid cursor-pointer items-center gap-[16px] px-[24px] py-[18px] transition hover:bg-[#fafbff]", tableColumns)}
                  key={signal.signalId}
                  onClick={() => {
                    window.location.href = `/signal-detail?id=${signal.signalId}`;
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex min-w-0 items-start gap-[16px]">
                    <span
                      className="flex size-[46px] shrink-0 items-center justify-center rounded-[12px] text-[14px] font-bold text-white"
                      style={{ backgroundColor: LOGO_COLORS[hashString(signal.company) % LOGO_COLORS.length] }}
                    >
                      {initialsOf(signal.company)}
                    </span>
                    <div className="min-w-0">
                      <p className="m-0 text-[15px] font-bold text-[#0f172a]">{signal.title}</p>
                      <p className="m-0 mt-[3px] text-[13px] leading-[19px] text-[#64748b]">{signal.description}</p>
                      <div className="mt-[10px] flex flex-wrap gap-[8px]">
                        {signal.tags.map((tag) => (
                          <Tag key={tag.label} label={tag.label} tone={tag.tone} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="m-0 truncate text-[14px] font-bold text-[#0f172a]">{signal.company}</p>
                  </div>

                  <div>
                    <IntentBadge level={signal.intent} />
                  </div>

                  <div className="flex items-center gap-[8px]">
                    <span className="text-[16px] font-bold text-[#0f172a]">{signal.score}</span>
                    <CheckCircle2 className="size-[17px] text-[#16a34a]" />
                  </div>

                  <span className="text-[13px] text-[#64748b]">{signal.detected}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

function PageButton({
  children,
  active = false,
  disabled = false,
  ariaLabel,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "flex size-[38px] items-center justify-center rounded-[10px] text-[14px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
        active ? "bg-[#4f46e5] text-white" : "border border-[#e9edf5] bg-white text-[#475569] hover:bg-[#f6f7fb]",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function pageNumbers(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const keep = new Set([1, 2, totalPages - 1, totalPages, current - 1, current, current + 1]);
  const sorted = [...keep].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) result.push("…");
    result.push(p);
    prev = p;
  }
  return result;
}

function Pagination({ page, total, onPageChange }: { page: number; total: number; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="relative mt-[24px] flex items-center justify-center">
      <div className="flex items-center gap-[8px]">
        <PageButton ariaLabel="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="size-[17px]" />
        </PageButton>
        {pageNumbers(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span className="px-[4px] text-[14px] text-[#94a3b8]" key={`ellipsis-${i}`}>…</span>
          ) : (
            <PageButton active={p === page} key={p} onClick={() => onPageChange(p)}>{p}</PageButton>
          ),
        )}
        <PageButton ariaLabel="Next page" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          <ChevronRight className="size-[17px]" />
        </PageButton>
      </div>
      <span className="absolute right-0 hidden text-[13px] text-[#64748b] lg:block">
        Showing {start} to {end} of {total} signals
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function SignalFeedPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [category]);

  useEffect(() => {
    const organisationId = getOrganisationId();
    if (!organisationId) {
      return;
    }
    listSignals(organisationId, { page, page_size: PAGE_SIZE, category: category || undefined })
      .then((res) => {
        setTotal(res.total);
        setSignals(res.items.map(toSignal));
      })
      .catch(() => setSignals([]));
  }, [category, page]);

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Signal Intelligence" activeSub="Signal Feed" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          searchPlaceholder="Search companies, triggers, executives..."
          showDetection={false}
          showNotificationBell={false}
        />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[24px]">
          <div className="flex items-center gap-[12px]">
            <h1 className="m-0 text-[26px] font-bold text-[#0f172a]">Signal Feed</h1>
            <span className="rounded-[7px] bg-[#f3e9ff] px-[10px] py-[4px] text-[12px] font-semibold text-[#7c3aed]">
              {total} signals
            </span>
          </div>
          <p className="m-0 mt-[6px] text-[15px] text-[#64748b]">
            Buying signals extracted from your uploaded company data.
          </p>

          <div className="mt-[22px]">
            <CategoryFilter onChange={setCategory} value={category} />
          </div>

          <div className="mt-[18px]">
            <SignalTable signals={signals} />
          </div>

          <Pagination onPageChange={setPage} page={page} total={total} />
        </main>
      </div>
    </div>
  );
}
