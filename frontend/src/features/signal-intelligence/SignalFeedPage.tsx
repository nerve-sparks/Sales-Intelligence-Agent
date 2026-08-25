import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { cn } from "../../lib/cn";
import { listSignals, type SignalWithCompanyOut } from "../../api/signals";
import { getCompanyStats } from "../../api/companies";
import { getOrganisationId } from "../../lib/session";
import { categoryLabel, SIGNAL_CATEGORY_OPTIONS } from "../../lib/signalCategories";

/* Signal Feed shows ONLY real extracted signals from the /signals list
 * endpoint - each row's title/fact/category/type/confidence/company/time is
 * real. The old dummy rows, fake filter buttons (industry/geography/etc. -
 * no backing column), placeholder company logos/domains/sizes, and the
 * hardcoded pagination are removed. Category is the one real filter
 * (Signal.signal_category) and pagination is wired to the real total. */

const PAGE_SIZE = 20;

/* Lets a category card elsewhere (Trigger Library) deep-link straight into
 * a pre-filtered feed instead of landing on the unfiltered "All Categories"
 * view and making the user re-select it. */
function getCategoryFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("category") ?? "";
}

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

const relevanceTones: Record<string, string> = {
  High: "bg-[#f3e9ff] text-[#7c3aed]",
  Medium: "bg-[#fff1e3] text-[#f97316]",
  Low: "bg-[#eff6ff] text-[#2563eb]",
};

function RelevanceBadge({ level }: { level: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-[8px] px-[12px] py-[5px] text-[13px] font-semibold", relevanceTones[level])}>
      {level}
    </span>
  );
}

/* signal_category is the only filter dimension backed by a real column, wired
 * to the /signals list endpoint's ?category= param. Every control below is
 * backed by a real column and a real query param - nothing here is decorative,
 * which is what the previous "fake filter buttons" comment referred to. */
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative flex items-center rounded-[10px] border border-[#e9edf5] bg-white pl-[14px] pr-[30px] py-[10px] text-[14px] font-medium text-[#334155]">
      <span className="mr-[6px] shrink-0 text-[12px] text-[#94a3b8]">{label}</span>
      <select
        aria-label={label}
        className="cursor-pointer appearance-none bg-transparent outline-none"
        onChange={(e) => onChange(e.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-[12px] size-[15px] text-[#94a3b8]" />
    </div>
  );
}

/* Sort options are all descending - see listSignals. "Company" is A-Z by name
 * with newest-first inside each company, which is the only ordering where
 * ascending is the useful direction. */
const SORT_OPTIONS = [
  { value: "date", label: "Newest first" },
  { value: "score", label: "Highest score" },
  { value: "company", label: "Company A-Z" },
];

const MIN_SCORE_OPTIONS = [
  { value: "", label: "Any score" },
  { value: "10", label: "10+" },
  { value: "20", label: "20+" },
  { value: "30", label: "30+" },
  { value: "40", label: "40+" },
];

function FilterBar({
  category,
  onCategory,
  sector,
  onSector,
  minScore,
  onMinScore,
  sort,
  onSort,
  sectors,
}: {
  category: string;
  onCategory: (v: string) => void;
  sector: string;
  onSector: (v: string) => void;
  minScore: string;
  onMinScore: (v: string) => void;
  sort: string;
  onSort: (v: string) => void;
  sectors: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-[10px]">
      <Select
        label="Category"
        onChange={onCategory}
        options={[
          { value: "", label: "All Categories" },
          ...SIGNAL_CATEGORY_OPTIONS.map((o) => ({ value: o, label: categoryLabel(o) })),
        ]}
        value={category}
      />
      <Select
        label="Industry"
        onChange={onSector}
        options={[
          { value: "", label: "All Industries" },
          ...sectors.map((s) => ({ value: s, label: s })),
        ]}
        value={sector}
      />
      <Select label="Min score" onChange={onMinScore} options={MIN_SCORE_OPTIONS} value={minScore} />
      <Select label="Sort" onChange={onSort} options={SORT_OPTIONS} value={sort} />
    </div>
  );
}

type Signal = {
  signalId: string;
  company: string;
  title: string;
  description: string;
  tags: { label: string; tone: string }[];
  relevance: string;
  score: number;
  detected: string;
};

function toSignal(s: SignalWithCompanyOut): Signal {
  const relevanceValue = s.relevance ?? 0;
  const relevance = relevanceValue >= 0.65 ? "High" : relevanceValue >= 0.4 ? "Medium" : "Low";
  return {
    signalId: s.buying_event_id,
    company: s.company_name,
    title: s.title || titleize(s.event_type),
    description: s.summary ?? "—",
    tags: [
      ...(s.category ? [{ label: categoryLabel(s.category), tone: "purple" }] : []),
      ...((s.evidence?.length ?? 0) > 1 ? [{ label: `${s.evidence?.length} sources`, tone: "gray" }] : []),
    ],
    relevance,
    score: Math.round((s.event_score ?? 0)),
    detected: relativeTime(s.published_at),
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
            <span>Relevance</span>
            <span>Score</span>
            <span>Detected</span>
          </div>

          {signals.length === 0 ? (
            <div className="px-[24px] py-[48px] text-center text-[13px] text-[#94a3b8]">
              No buying events yet. Upload prospect data to start research.
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
                    <RelevanceBadge level={signal.relevance} />
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
  const [category, setCategory] = useState(getCategoryFromUrl);
  const [sector, setSector] = useState("");
  const [minScore, setMinScore] = useState("");
  const [sort, setSort] = useState("date");
  const [sectors, setSectors] = useState<string[]>([]);
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
    listSignals(organisationId, {
      page,
      page_size: PAGE_SIZE,
      category: category || undefined,
      sector: sector || undefined,
      min_score: minScore ? Number(minScore) : undefined,
      sort: sort as "date" | "score" | "company",
    })
      .then((res) => {
        setTotal(res.total);
        setSignals(res.items.map(toSignal));
      })
      .catch(() => setSignals([]));
  }, [category, sector, minScore, sort, page]);

  /* Sector list comes from the API's own rollup so this page never carries a
     second copy of the industry->sector mapping. */
  useEffect(() => {
    const organisationId = getOrganisationId();
    if (!organisationId) {
      return;
    }
    getCompanyStats(organisationId)
      .then((stats) => setSectors(stats.by_sector.map((s) => s.sector)))
      .catch(() => setSectors([]));
  }, []);

  /* Any filter change invalidates the current page number - staying on page 7
     of a narrower result set shows an empty table. */
  useEffect(() => {
    setPage(1);
  }, [category, sector, minScore, sort]);

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
            Canonical buying events researched live via Tavily for your uploaded companies.
          </p>

          <div className="mt-[22px]">
            <FilterBar
              category={category}
              minScore={minScore}
              onCategory={setCategory}
              onMinScore={setMinScore}
              onSector={setSector}
              onSort={setSort}
              sector={sector}
              sectors={sectors}
              sort={sort}
            />
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
