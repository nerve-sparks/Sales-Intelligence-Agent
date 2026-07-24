import {
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Flame,
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
import { getIcpCompanies, listIcps, listImportBatches, type IcpOut, type ImportBatchOut } from "../../api/icp";
import { getRankedScores } from "../../api/scores";
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
    { icon: ShieldCheck, bg: "#f3e9ff", color: "#7c3aed", label: "Total Enterprises", value: data.total.toLocaleString(), spark: "#7c3aed", values: FLAT_LINE },
    { icon: Settings, bg: "#e7f8ef", color: "#16a34a", label: "High Intent Enterprises", value: data.high_intent.toLocaleString(), spark: "#16a34a", values: FLAT_LINE },
    { icon: Users, bg: "#fff1e3", color: "#f97316", label: "Medium Intent Enterprises", value: data.medium_intent.toLocaleString(), spark: "#f97316", values: FLAT_LINE },
    { icon: Bell, bg: "#fdecec", color: "#ef4444", label: "Low Intent Enterprises", value: data.low_intent.toLocaleString(), spark: "#2563eb", values: FLAT_LINE },
  ];
}

const emptyStats = toStatCards({ total: 0, high_intent: 0, medium_intent: 0, low_intent: 0, by_country: [] });

function StatCards({ stats }: { stats: StatCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 xl:grid-cols-4">
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

function IcpFilterSelect({
  icps,
  selectedIcpId,
  onChange,
}: {
  icps: IcpOut[];
  selectedIcpId: string;
  onChange: (icpId: string) => void;
}) {
  return (
    <div className="relative flex h-[42px] items-center rounded-[10px] border border-[#e9edf5] bg-white px-[14px]">
      <select
        className="h-full appearance-none bg-transparent pr-[24px] text-[14px] font-medium text-[#334155] outline-none"
        onChange={(e) => onChange(e.target.value)}
        value={selectedIcpId}
      >
        <option value="all">All Companies</option>
        {icps.map((icp) => (
          <option key={icp.icp_id} value={icp.icp_id}>
            {icp.name || "Untitled ICP"}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-[14px] size-[15px] text-[#94a3b8]" />
    </div>
  );
}

function formatBatchLabel(batch: ImportBatchOut): string {
  const when = batch.created_at
    ? new Date(batch.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "Unknown date";
  const suffix = batch.scoring_status === "pending" ? " (Scoring…)" : "";
  return `${when} · ${batch.icp_name || "Untitled ICP"} · ${batch.companies_ingested} companies${suffix}`;
}

/* Filters to one specific Excel upload (Company.import_batch_id) - separate
 * axis from the ICP dropdown above (ICP fit vs. "which upload did this
 * company come from"). Selecting a batch here and an ICP there don't
 * currently compose (getIcpCompanies has no batch param) - picking one
 * resets the other back to "all", so it's always unambiguous which single
 * filter is active. Batches still mid-scoring show a "Scoring…" suffix so
 * it's clear the numbers you'd see for that upload aren't final yet. */
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
  icps,
  selectedIcpId,
  onIcpChange,
  batches,
  selectedBatchId,
  onBatchChange,
  search,
  onSearchChange,
}: {
  icps: IcpOut[];
  selectedIcpId: string;
  onIcpChange: (icpId: string) => void;
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
      <IcpFilterSelect icps={icps} onChange={onIcpChange} selectedIcpId={selectedIcpId} />
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
  intent: string;
  tier: "high" | "medium" | "low";
  status: string;
  statusColor: string;
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
};

/* CompanyListItemOut has no intent/status - those are derived from the real
 * lead_score / gate_status. leadScore/gateStatus are passed explicitly: the
 * "all companies" path reads them off CompanyListItemOut, but the ICP-
 * filtered path (getIcpCompanies) returns plain CompanyOut with no score, so
 * that caller looks scores up via getRankedScores() first. */
function toEnterprise(company: CompanyLike, leadScore: number | null, gateStatus: string | null): Enterprise {
  const scored = leadScore !== null;
  const rawScore = leadScore ?? 0;
  // lead_score is a 0-100 float; round for display (matches every other CRM
  // page — EnterpriseDetail/ScoreBreakdown/etc all Math.round it) but keep the
  // raw value for the tier thresholds.
  const score = Math.round(rawScore);
  const tier: Enterprise["tier"] = rawScore >= 80 ? "high" : rawScore >= 60 ? "medium" : "low";
  const intent = !scored ? "—" : tier === "high" ? "High" : tier === "medium" ? "Medium" : "Low";
  const status = gateStatus === "active" ? "Active" : gateStatus === "nurture" ? "Nurture" : "Unscored";
  const statusColor = gateStatus === "active" ? "#16a34a" : gateStatus === "nurture" ? "#f97316" : "#94a3b8";
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
    intent,
    tier,
    status,
    statusColor,
    revenue: company.revenue_range ?? "—",
    employees: company.employee_range ?? "—",
  };
}

const intentTones: Record<string, string> = {
  high: "text-[#16a34a]",
  medium: "text-[#f97316]",
  low: "text-[#2563eb]",
};

function IntentTag({ intent, tier }: { intent: string; tier: string }) {
  if (intent === "—") {
    return <span className="text-[13px] text-[#94a3b8]">—</span>;
  }
  const Icon = tier === "medium" ? Flame : ArrowUpRight;
  return (
    <span className={cn("inline-flex items-center gap-[6px] text-[13px] font-semibold", intentTones[tier])}>
      <Icon className="size-[15px]" />
      {intent}
    </span>
  );
}

const cols =
  "grid-cols-[minmax(0,1.7fr)_0.9fr_1.2fr_1.2fr_1fr_1fr_1.1fr_0.95fr]";

function EnterpriseTable({ enterprises }: { enterprises: Enterprise[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[960px]">
        <div className={cn("grid items-center gap-[12px] border-b border-[#eef1f6] px-[8px] pb-[12px] text-[12px] font-semibold text-[#94a3b8]", cols)}>
          <span>Enterprise Name</span>
          <span>Industry</span>
          <span>Location</span>
          <span className="flex items-center gap-[4px]">Enterprise Score <ChevronDown className="size-[13px]" /></span>
          <span>Intent Level</span>
          <span>Status</span>
          <span>Revenue</span>
          <span>Employees</span>
        </div>

        {enterprises.length === 0 ? (
          <div className="px-[8px] py-[48px] text-center text-[13px] text-[#94a3b8]">
            No companies found. Upload a ZoomInfo export from Settings to populate this list.
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
                  <span className="truncate text-[14px] font-semibold text-[#0f172a]">{e.name}</span>
                </div>

                <span className="truncate text-[13px] text-[#475569]">{e.industry}</span>

                <span className="truncate text-[13px] text-[#475569]">{e.location}</span>

                <div className="flex items-center gap-[10px]">
                  <span className="w-[30px] text-[14px] font-bold text-[#0f172a]">{e.scored ? e.score : "—"}</span>
                  <span className="h-[6px] flex-1 rounded-full bg-[#e5e7eb]">
                    <span className="block h-full rounded-full bg-[#22c55e]" style={{ width: `${Math.min(100, Math.max(0, e.score))}%` }} />
                  </span>
                </div>

                <IntentTag intent={e.intent} tier={e.tier} />

                <span className="flex items-center gap-[6px] text-[13px] font-medium text-[#334155]">
                  <span className="size-[7px] rounded-full" style={{ backgroundColor: e.statusColor }} />
                  {e.status}
                </span>

                <span className="text-[13px] text-[#475569]">{e.revenue}</span>
                <span className="text-[13px] text-[#475569]">{e.employees}</span>
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

// Top lead score first - the backend already orders "all companies" this way
// (LeadScore.lead_score desc nulls last); the ICP-filtered branch merges
// scores in JS after two fetches, so it needs its own explicit sort.
const byScoreDesc = (a: Enterprise, b: Enterprise) => b.score - a.score;

export function EnterpriseListPage() {
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [icps, setIcps] = useState<IcpOut[]>([]);
  const [selectedIcpId, setSelectedIcpId] = useState("all");
  const [batches, setBatches] = useState<ImportBatchOut[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("all");
  const [statCards, setStatCards] = useState<StatCard[]>(emptyStats);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [icpMatches, setIcpMatches] = useState<Enterprise[] | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // The ICP filter and the per-upload filter are separate axes that don't
  // currently compose (see UploadFilterSelect's comment) - picking one
  // resets the other, so exactly one is ever active.
  const handleIcpChange = (icpId: string) => {
    setSelectedIcpId(icpId);
    setSelectedBatchId("all");
  };
  const handleBatchChange = (batchId: string) => {
    setSelectedBatchId(batchId);
    setSelectedIcpId("all");
  };

  // Debounce the search box so a keystroke doesn't fire a request each time.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Populate the ICP filter dropdown once.
  useEffect(() => {
    const workspaceId = getWorkspaceId();
    if (!workspaceId) {
      return;
    }
    listIcps(workspaceId)
      .then(setIcps)
      .catch(() => {
        // No backend/workspace yet - dropdown just shows "All Companies".
      });
  }, []);

  // Populate the per-upload filter dropdown, then keep polling while any
  // upload is still scoring - so a batch's "(Scoring…)" label (and the
  // company list, if that batch happens to be selected) picks up newly-
  // scored companies as the background scoring task progresses, without
  // requiring a manual page reload.
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
  }, [selectedIcpId, selectedBatchId, search]);

  // "All Companies" is paginated + searched server-side. selectedBatchId
  // narrows it to one upload's companies; the "all"/"all" guard stays
  // correct because handleBatchChange always resets selectedIcpId to "all".
  useEffect(() => {
    if (selectedIcpId !== "all") {
      return;
    }
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
        setEnterprises(res.items.map((c) => toEnterprise(c, c.lead_score, c.gate_status)).sort(byScoreDesc));
      })
      .catch(() => setEnterprises([]));
  }, [selectedIcpId, selectedBatchId, page, search]);

  // ICP-filtered: fetch the full match set once per filter/refresh.
  useEffect(() => {
    const organisationId = getOrganisationId();
    const workspaceId = getWorkspaceId();
    if (selectedIcpId === "all" || !organisationId || !workspaceId) {
      setIcpMatches(null);
      return;
    }
    Promise.all([getIcpCompanies(workspaceId, selectedIcpId), getRankedScores(organisationId)])
      .then(([icpResult, ranked]) => {
        const scoreByName = new Map(ranked.map((r) => [r.company_name, r]));
        setIcpMatches(
          icpResult.companies
            .map((c) => {
              const matched = scoreByName.get(c.company_name);
              return toEnterprise(c, matched?.lead_score ?? null, matched?.gate_status ?? null);
            })
            .sort(byScoreDesc),
        );
      })
      .catch(() => setIcpMatches([]));
  }, [selectedIcpId]);

  // Slice the full ICP match list into the current page (with client-side
  // name search, since getIcpCompanies isn't paginated/searched server-side).
  useEffect(() => {
    if (icpMatches === null) {
      return;
    }
    const filtered = search
      ? icpMatches.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
      : icpMatches;
    setTotal(filtered.length);
    setEnterprises(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
  }, [icpMatches, page, search]);

  // Exports the companies currently shown, with real LeadScore columns.
  const handleExport = async () => {
    const organisationId = getOrganisationId();
    if (!organisationId) {
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const blob = await exportCompanies(organisationId, selectedIcpId === "all" ? undefined : selectedIcpId);
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
                icps={icps}
                onBatchChange={handleBatchChange}
                onIcpChange={handleIcpChange}
                onSearchChange={setSearchInput}
                search={searchInput}
                selectedBatchId={selectedBatchId}
                selectedIcpId={selectedIcpId}
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
