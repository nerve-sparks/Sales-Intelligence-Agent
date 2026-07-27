import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { FLAT_LINE, Sparkline } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";
import { exportCompanies, getCompanyStats, listCompanies, type CompanyStatsOut } from "../../api/companies";
import { ApiError } from "../../api/client";
import { listImportBatches, type ImportBatchOut } from "../../api/icp";
import { getOrganisationId, getWorkspaceId } from "../../lib/session";

/* Enterprise List shows ONLY real data: company counts (stat cards), and per
 * company the real firmographics + lead score + intent tier + gate status
 * from the uploaded ZoomInfo export. The old fabricated bits (per-company
 * engagement sparklines, "last signal" times, favourite stars, country
 * flags, delta trends, dummy rows/filters) are removed - nothing backs them.
 * The one real chart (the Enterprise Score bar) is unchanged. */

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

const PAGE_SIZE = 25;

/* ------------------------------------------------------------------ */
/* Stat cards                                                          */
/* ------------------------------------------------------------------ */

type StatCard = {
  icon: typeof ShieldCheck;
  bg: string;
  color: string;
  label: string;
  value: string;
  spark: string;
  values: number[];
};

/* CompanyStatsOut is a single snapshot with no time series, so there's no
 * real vs-last-week delta and no day-over-day history to plot - the sparkline
 * renders a flat line rather than a fabricated trend. */
function toStatCards(data: CompanyStatsOut): StatCard[] {
  return [
    { icon: ShieldCheck, bg: "#f3e9ff", color: "#7c3aed", label: "Total Companies", value: data.total.toLocaleString(), spark: "#7c3aed", values: FLAT_LINE },
    { icon: Settings, bg: "#e7f8ef", color: "#16a34a", label: "Sales Ready", value: data.sales_ready.toLocaleString(), spark: "#16a34a", values: FLAT_LINE },
    { icon: Users, bg: "#fff1e3", color: "#22c55e", label: "High Priority", value: data.high_priority.toLocaleString(), spark: "#22c55e", values: FLAT_LINE },
    { icon: Bell, bg: "#fff1e3", color: "#f97316", label: "Warm", value: data.warm.toLocaleString(), spark: "#f97316", values: FLAT_LINE },
    { icon: Bell, bg: "#fef9e7", color: "#eab308", label: "Monitor", value: data.monitor.toLocaleString(), spark: "#eab308", values: FLAT_LINE },
    { icon: Bell, bg: "#f1f5f9", color: "#94a3b8", label: "Low Priority", value: data.low_priority.toLocaleString(), spark: "#94a3b8", values: FLAT_LINE },
  ];
}

const emptyStats = toStatCards({ total: 0, scored: 0, unscored: 0, sales_ready: 0, high_priority: 0, warm: 0, monitor: 0, low_priority: 0, high_confidence: 0, provisional_pipeline_value: 0, by_country: [] });

function StatCards({ stats }: { stats: StatCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-[16px] sm:grid-cols-3 xl:grid-cols-6">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[18px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]" key={s.label}>
            <div className="flex items-center gap-[10px]">
              <span className="flex size-[40px] shrink-0 items-center justify-center rounded-[10px]" style={{ backgroundColor: s.bg, color: s.color }}>
                <Icon className="size-[20px]" />
              </span>
              <span className="text-[14px] font-semibold text-[#475569]">{s.label}</span>
            </div>
            <p className="m-0 mt-[12px] text-[28px] font-bold leading-none text-[#0f172a]">{s.value}</p>
            <div className="mt-[8px]">
              <Sparkline className="h-[42px] w-full" color={s.spark} gradientId={`ent-${s.label.replace(/\s+/g, "")}`} values={s.values} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */

const tabs = ["All Enterprises"];

function EnterpriseTabs() {
  return (
    <div className="flex gap-[28px] overflow-x-auto border-b border-[#e9edf5]">
      {tabs.map((tab, i) => (
        <button
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 pb-[14px] text-[14px] font-semibold transition",
            i === 0 ? "border-[#5b3df5] text-[#5b3df5]" : "border-transparent text-[#64748b] hover:text-[#334155]",
          )}
          key={tab}
          type="button"
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function formatBatchLabel(batch: ImportBatchOut): string {
  const when = batch.created_at
    ? new Date(batch.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "Unknown date";
  const suffix = batch.scoring_status === "pending" ? " (Scoring…)" : "";
  const label = batch.file_names?.[0] || "Upload";
  return `${when} · ${label} · ${batch.companies_ingested} companies${suffix}`;
}

/* Filters the list to one specific prospect upload (Company.import_batch_id).
 * Batches still mid-scoring show a "Scoring…" suffix so it's clear that
 * upload's numbers aren't final yet. */
function UploadFilterSelect({
  batches,
  selectedBatchId,
  onChange,
}: {
  batches: ImportBatchOut[];
  selectedBatchId: string;
  onChange: (batchId: string) => void;
}) {
  return (
    <div className="relative flex h-[42px] items-center rounded-[10px] border border-[#e9edf5] bg-white px-[14px]">
      <select
        className="h-full max-w-[220px] appearance-none bg-transparent pr-[24px] text-[14px] font-medium text-[#334155] outline-none"
        onChange={(e) => onChange(e.target.value)}
        value={selectedBatchId}
      >
        <option value="all">Every Upload</option>
        {batches.map((batch) => (
          <option key={batch.import_batch_id} value={batch.import_batch_id}>
            {formatBatchLabel(batch)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-[14px] size-[15px] text-[#94a3b8]" />
    </div>
  );
}

function Toolbar({
  batches,
  selectedBatchId,
  onBatchChange,
  search,
  onSearchChange,
}: {
  batches: ImportBatchOut[];
  selectedBatchId: string;
  onBatchChange: (batchId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-[12px]">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-[14px] top-1/2 size-[16px] -translate-y-1/2 text-[#94a3b8]" />
        <input
          className="h-[42px] w-full rounded-[10px] border border-[#e9edf5] bg-white pl-[40px] pr-[14px] text-[14px] text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search enterprises..."
          type="search"
          value={search}
        />
      </div>
      <UploadFilterSelect batches={batches} onChange={onBatchChange} selectedBatchId={selectedBatchId} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Table                                                               */
/* ------------------------------------------------------------------ */

type Enterprise = {
  companyId: string;
  logo: string;
  bg: string;
  name: string;
  industry: string;
  location: string;
  score: number;
  scored: boolean;
  salesStatus: string;
  statusColor: string;
  confidence: string;
  whyNow: string;
  bestOffering: string;
  dealValue: string;
  revenue: string;
  employees: string;
};

const LOGO_COLORS = ["#16a34a", "#2563eb", "#7c3aed", "#0d9488", "#ef4444", "#6366f1", "#10b981", "#3b82f6", "#334155", "#f97316"];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

type CompanyLike = {
  company_id: string;
  company_name: string;
  city: string | null;
  country: string | null;
  industries: string[] | null;
  revenue_range: string | null;
  employee_range: string | null;
  lead_score: number | null;
  sales_status: string | null;
  confidence_label: string | null;
  best_offering: string | null;
  why_now: string | null;
  expected_deal_value_usd: number | null;
};

// Sales-status band -> dot colour (brief section 17).
const SALES_STATUS_COLOR: Record<string, string> = {
  "Sales Ready": "#16a34a",
  "High Priority": "#22c55e",
  Warm: "#f97316",
  Monitor: "#eab308",
  "Low Priority": "#94a3b8",
};

function formatDealValue(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${Math.round(value)}`;
}

/* Every field is the evidence-based score straight off CompanyListItemOut - no
 * ICP, no gates. */
function toEnterprise(company: CompanyLike): Enterprise {
  const leadScore = company.lead_score;
  const scored = leadScore !== null;
  const score = Math.round(leadScore ?? 0);
  const salesStatus = company.sales_status ?? (scored ? "Low Priority" : "Unscored");
  const initials = company.company_name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const bg = LOGO_COLORS[hashString(company.company_name) % LOGO_COLORS.length];

  return {
    companyId: company.company_id,
    logo: initials || "?",
    bg,
    name: company.company_name,
    industry: company.industries?.[0] ?? "—",
    location: [company.city, company.country].filter(Boolean).join(", ") || "—",
    score,
    scored,
    salesStatus,
    statusColor: SALES_STATUS_COLOR[salesStatus] ?? "#94a3b8",
    confidence: company.confidence_label ?? "—",
    whyNow: company.why_now ?? "—",
    bestOffering: company.best_offering ?? "—",
    dealValue: formatDealValue(company.expected_deal_value_usd),
    revenue: company.revenue_range ?? "—",
    employees: company.employee_range ?? "—",
  };
}

const cols =
  "grid-cols-[minmax(0,1.6fr)_1.1fr_1fr_0.9fr_minmax(0,1.6fr)_1fr]";

function EnterpriseTable({ enterprises }: { enterprises: Enterprise[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[960px]">
        <div className={cn("grid items-center gap-[12px] border-b border-[#eef1f6] px-[8px] pb-[12px] text-[12px] font-semibold text-[#94a3b8]", cols)}>
          <span>Company</span>
          <span className="flex items-center gap-[4px]">Lead Score <ChevronDown className="size-[13px]" /></span>
          <span>Sales Status</span>
          <span>Confidence</span>
          <span>Best XSparks Offering</span>
          <span>Expected Deal</span>
        </div>

        {enterprises.length === 0 ? (
          <div className="px-[8px] py-[48px] text-center text-[13px] text-[#94a3b8]">
            No companies found. Upload prospect data from Settings to populate this list.
          </div>
        ) : (
          <div className="divide-y divide-[#f1f5f9]">
            {enterprises.map((e) => (
              <div
                className={cn("grid cursor-pointer items-center gap-[12px] rounded-[8px] px-[8px] py-[13px] transition hover:bg-[#fafbff]", cols)}
                key={e.companyId}
                onClick={() => {
                  window.location.href = `/enterprise-detail?id=${e.companyId}`;
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex min-w-0 items-center gap-[10px]">
                  <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] text-[11px] font-bold text-white" style={{ backgroundColor: e.bg }}>
                    {e.logo}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-[#0f172a]">{e.name}</span>
                    <span className="block truncate text-[12px] text-[#94a3b8]">{e.industry} · {e.location}</span>
                  </span>
                </div>

                <div className="flex items-center gap-[10px]">
                  <span className="w-[30px] text-[14px] font-bold text-[#0f172a]">{e.scored ? e.score : "—"}</span>
                  <span className="h-[6px] flex-1 rounded-full bg-[#e5e7eb]">
                    <span className="block h-full rounded-full bg-[#22c55e]" style={{ width: `${Math.min(100, Math.max(0, e.score))}%` }} />
                  </span>
                </div>

                <span className="flex items-center gap-[6px] text-[13px] font-medium text-[#334155]">
                  <span className="size-[7px] rounded-full" style={{ backgroundColor: e.statusColor }} />
                  {e.salesStatus}
                </span>

                <span className="text-[13px] text-[#475569]">{e.confidence}</span>

                <span className="truncate text-[13px] text-[#475569]" title={e.whyNow}>{e.bestOffering}</span>

                <span className="text-[13px] font-medium text-[#334155]">{e.dealValue}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pagination pieces                                                   */
/* ------------------------------------------------------------------ */

function PageBtn({
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
        "flex size-[34px] items-center justify-center rounded-[9px] text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
        active ? "bg-[#5b3df5] text-white" : "border border-[#e9edf5] bg-white text-[#475569] hover:bg-[#f6f7fb]",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function PerPage() {
  return (
    <span className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[8px] text-[13px] font-semibold text-[#334155]">
      {PAGE_SIZE} per page
    </span>
  );
}

/* Compresses a long page range to first-2/last-2/window-around-current with
 * "…" gaps - computed from the real total. */
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

function Pagination({
  page,
  total,
  onPageChange,
}: {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex flex-wrap items-center justify-end gap-[12px]">
      <span className="text-[13px] text-[#64748b]">
        Showing {start} - {end} of {total} enterprises
      </span>
      <PerPage />
      <div className="flex items-center gap-[6px]">
        <PageBtn ariaLabel="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="size-[16px]" />
        </PageBtn>
        {pageNumbers(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span className="px-[4px] text-[14px] text-[#94a3b8]" key={`ellipsis-${i}`}>
              …
            </span>
          ) : (
            <PageBtn active={p === page} key={p} onClick={() => onPageChange(p)}>
              {p}
            </PageBtn>
          ),
        )}
        <PageBtn ariaLabel="Next page" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          <ChevronRight className="size-[16px]" />
        </PageBtn>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function EnterpriseListPage() {
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [batches, setBatches] = useState<ImportBatchOut[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("all");
  const [statCards, setStatCards] = useState<StatCard[]>(emptyStats);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const handleBatchChange = (batchId: string) => setSelectedBatchId(batchId);

  // Debounce the search box so a keystroke doesn't fire a request each time.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Populate the per-upload filter dropdown, then keep polling while any
  // upload is still scoring - so a batch's "(Scoring…)" label and the
  // company list pick up newly-scored companies as the background task
  // progresses, without a manual reload.
  useEffect(() => {
    const workspaceId = getWorkspaceId();
    if (!workspaceId) {
      return;
    }
    const load = () => listImportBatches(workspaceId).then(setBatches).catch(() => {});
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  // Org-wide totals for the stat cards - independent of filter/page/search.
  useEffect(() => {
    const organisationId = getOrganisationId();
    if (!organisationId) {
      return;
    }
    getCompanyStats(organisationId)
      .then((data) => setStatCards(toStatCards(data)))
      .catch(() => {
        // No backend/org yet - keep the zero stat cards.
      });
  }, []);

  // Reset to page 1 whenever the filter or search changes.
  useEffect(() => {
    setPage(1);
  }, [selectedBatchId, search]);

  // Every scored company, paginated + searched server-side, ordered by lead
  // score. selectedBatchId narrows to one upload's companies. No ICP filter -
  // every company appears (brief section 26).
  useEffect(() => {
    const organisationId = getOrganisationId();
    if (!organisationId) {
      return;
    }
    listCompanies(organisationId, {
      page,
      page_size: PAGE_SIZE,
      search: search || undefined,
      import_batch_id: selectedBatchId !== "all" ? selectedBatchId : undefined,
    })
      .then((res) => {
        setTotal(res.total);
        setEnterprises(res.items.map(toEnterprise));
      })
      .catch(() => setEnterprises([]));
  }, [selectedBatchId, page, search]);

  // Exports the companies currently shown, with evidence-based score columns.
  const handleExport = async () => {
    const organisationId = getOrganisationId();
    if (!organisationId) {
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const blob = await exportCompanies(organisationId, selectedBatchId === "all" ? undefined : selectedBatchId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "companies_export.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof ApiError ? String(err.detail) : "Export failed. Please try again.");
    }
    setExporting(false);
  };

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Enterprise List" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          searchPlaceholder="Search companies, triggers, executives..."
          showDetection={false}
          showNotificationBell={false}
        />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          <div className="flex flex-col gap-[16px] xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="m-0 text-[26px] font-bold text-[#0f172a]">Enterprise List</h1>
              <p className="m-0 mt-[6px] text-[15px] text-[#64748b]">
                Every company from your uploaded data, ranked by lead score.
              </p>
            </div>
            <div className="flex flex-col items-end gap-[6px]">
              <div className="flex flex-wrap items-center gap-[10px]">
                <button
                  className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-semibold text-[#334155] disabled:opacity-60"
                  disabled={exporting}
                  onClick={handleExport}
                  type="button"
                >
                  <Download className="size-[16px] text-[#64748b]" />
                  {exporting ? "Exporting..." : "Export"}
                </button>
              </div>
              {exportError && <p className="m-0 text-[12px] font-medium text-[#ef4444]">{exportError}</p>}
            </div>
          </div>

          <div className="mt-[22px]">
            <StatCards stats={statCards} />
          </div>

          <div className="mt-[22px] rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
            <EnterpriseTabs />

            <div className="mt-[18px]">
              <Toolbar
                batches={batches}
                onBatchChange={handleBatchChange}
                onSearchChange={setSearchInput}
                search={searchInput}
                selectedBatchId={selectedBatchId}
              />
            </div>

            <div className="mt-[16px]">
              <EnterpriseTable enterprises={enterprises} />
            </div>

            <div className="mt-[18px] border-t border-[#f1f5f9] pt-[18px]">
              <Pagination onPageChange={setPage} page={page} total={total} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
