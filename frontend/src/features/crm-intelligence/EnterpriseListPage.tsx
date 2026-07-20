import {
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Flame,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Upload,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Sparkline, UpTriangle } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";
import { exportCompanies, getCompanyStats, listCompanies, type CompanyStatsOut } from "../../api/companies";
import { ApiError } from "../../api/client";
import { getIcpCompanies, listIcps, type IcpOut } from "../../api/icp";
import { getRankedScores } from "../../api/scores";
import { getOrganisationId, getWorkspaceId } from "../../lib/session";

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

/* ------------------------------------------------------------------ */
/* Stat cards                                                          */
/* ------------------------------------------------------------------ */

type StatCard = {
  icon: typeof ShieldCheck;
  bg: string;
  color: string;
  label: string;
  value: string;
  delta: string | null;
  down: boolean;
  spark: string;
  values: number[];
};

const dummyStats: StatCard[] = [
  { icon: ShieldCheck, bg: "#f3e9ff", color: "#7c3aed", label: "Total Enterprises", value: "3,842", delta: "8.6%", down: false, spark: "#7c3aed", values: [30, 36, 32, 40, 35, 44, 38, 46, 42, 50] },
  { icon: Settings, bg: "#e7f8ef", color: "#16a34a", label: "High Intent Enterprises", value: "628", delta: "15.3%", down: false, spark: "#16a34a", values: [26, 30, 28, 36, 32, 40, 36, 44, 40, 48] },
  { icon: Users, bg: "#fff1e3", color: "#f97316", label: "Medium Intent Enterprises", value: "1,256", delta: "9.7%", down: false, spark: "#f97316", values: [34, 30, 36, 32, 38, 33, 40, 35, 42, 38] },
  { icon: Bell, bg: "#fdecec", color: "#ef4444", label: "Low Intent Enterprises", value: "212", delta: "6.4%", down: true, spark: "#2563eb", values: [40, 36, 42, 34, 38, 30, 36, 32, 34, 30] },
];

/* CompanyStatsOut has no vs-last-7-days baseline - a single snapshot can't
 * produce a real delta, so those are dropped instead of faked. The
 * sparklines lose their meaning too (no time series behind them), so they
 * flatten to the current value rather than showing the old demo shape. */
function toStatCards(data: CompanyStatsOut): StatCard[] {
  return [
    { icon: ShieldCheck, bg: "#f3e9ff", color: "#7c3aed", label: "Total Enterprises", value: data.total.toLocaleString(), delta: null, down: false, spark: "#7c3aed", values: [data.total, data.total] },
    { icon: Settings, bg: "#e7f8ef", color: "#16a34a", label: "High Intent Enterprises", value: data.high_intent.toLocaleString(), delta: null, down: false, spark: "#16a34a", values: [data.high_intent, data.high_intent] },
    { icon: Users, bg: "#fff1e3", color: "#f97316", label: "Medium Intent Enterprises", value: data.medium_intent.toLocaleString(), delta: null, down: false, spark: "#f97316", values: [data.medium_intent, data.medium_intent] },
    { icon: Bell, bg: "#fdecec", color: "#ef4444", label: "Low Intent Enterprises", value: data.low_intent.toLocaleString(), delta: null, down: true, spark: "#2563eb", values: [data.low_intent, data.low_intent] },
  ];
}

function StatDelta({ value, down }: { value: string; down: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-[3px] text-[13px] font-semibold", down ? "text-[#ef4444]" : "text-[#16a34a]")}>
      <UpTriangle className={cn("size-[8px]", down && "rotate-180")} />
      {value}
    </span>
  );
}

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
            {s.delta && (
              <p className="m-0 mt-[8px] flex items-center gap-[6px] text-[12px] text-[#94a3b8]">
                <StatDelta down={s.down} value={s.delta} />
                vs last 7 days
              </p>
            )}
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

function DropFilter({ label }: { label: string }) {
  return (
    <button className="flex h-[42px] items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] text-[14px] font-medium text-[#334155]" type="button">
      {label}
      <ChevronDown className="size-[15px] text-[#94a3b8]" />
    </button>
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

function Toolbar({
  icps,
  selectedIcpId,
  onIcpChange,
}: {
  icps: IcpOut[];
  selectedIcpId: string;
  onIcpChange: (icpId: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-[12px]">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-[14px] top-1/2 size-[16px] -translate-y-1/2 text-[#94a3b8]" />
        <input
          className="h-[42px] w-full rounded-[10px] border border-[#e9edf5] bg-white pl-[40px] pr-[14px] text-[14px] text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
          placeholder="Search enterprises..."
          type="search"
        />
      </div>
      <IcpFilterSelect icps={icps} onChange={onIcpChange} selectedIcpId={selectedIcpId} />
      <DropFilter label="All Industries" />
      <DropFilter label="All Scores" />
      <DropFilter label="All Levels" />
      <DropFilter label="All Locations" />
      <button className="flex h-[42px] items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] text-[14px] font-medium text-[#334155]" type="button">
        <Filter className="size-[15px] text-[#5b3df5]" />
        More Filters
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Table                                                               */
/* ------------------------------------------------------------------ */

type Enterprise = {
  companyId?: string;
  logo: string;
  bg: string;
  name: string;
  fav: boolean;
  industry: string;
  flag: string;
  location: string;
  score: number;
  intent: string;
  tier: "high" | "medium" | "low";
  engagement: string;
  engColor: string;
  eng: number[];
  lastSignal: string;
  dot: string;
  revenue: string;
  employees: string;
};

const rising = [10, 14, 12, 16, 15, 18, 20];
const wavy = [15, 12, 16, 13, 17, 14, 18];
const falling = [20, 17, 18, 14, 15, 12, 10];

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

/* CompanyListItemOut has no intent/tier/engagement/sparkline/lastSignal -
 * those are UI-only concepts with no backend model. tier/intent are derived
 * from the real lead_score where available; engagement/sparkline/lastSignal
 * are synthesized since nothing backs them.
 *
 * leadScore/gateStatus are always passed explicitly: the "all companies"
 * path reads them straight off CompanyListItemOut, but the ICP-filtered
 * path (getIcpCompanies) returns plain CompanyOut with no score joined in,
 * so that caller looks scores up separately via getRankedScores() first. */
function toEnterprise(company: CompanyLike, leadScore: number | null, gateStatus: string | null): Enterprise {
  const score = leadScore ?? 0;
  const tier: Enterprise["tier"] = score >= 80 ? "high" : score >= 60 ? "medium" : "low";
  const intent = tier === "high" ? "High" : tier === "medium" ? "Medium" : "Low";
  const active = gateStatus === "active";
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
    fav: false,
    industry: company.industries?.[0] ?? "—",
    flag: "🏳️",
    location: [company.city, company.country].filter(Boolean).join(", ") || "—",
    score,
    intent,
    tier,
    engagement: active ? "Active" : "Dormant",
    engColor: active ? "#16a34a" : "#94a3b8",
    eng: active ? rising : falling,
    lastSignal: "—",
    dot: active ? "#16a34a" : "#94a3b8",
    revenue: company.revenue_range ?? "—",
    employees: company.employee_range ?? "—",
  };
}

const dummyEnterprises: Enterprise[] = [
  { logo: "TN", bg: "#16a34a", name: "TechNova Solutions", fav: true, industry: "Software", flag: "🇮🇳", location: "Bengaluru, India", score: 92, intent: "Very High", tier: "high", engagement: "Active", engColor: "#16a34a", eng: rising, lastSignal: "2h ago", dot: "#16a34a", revenue: "$25M - $50M", employees: "501 - 1,000" },
  { logo: "CS", bg: "#2563eb", name: "CloudScale Inc.", fav: true, industry: "Cloud Services", flag: "🇺🇸", location: "San Francisco, USA", score: 88, intent: "High", tier: "high", engagement: "Active", engColor: "#16a34a", eng: rising, lastSignal: "5h ago", dot: "#16a34a", revenue: "$50M - $100M", employees: "1,001 - 2,500" },
  { logo: "DW", bg: "#7c3aed", name: "DataWeave Analytics", fav: false, industry: "Analytics", flag: "🇺🇸", location: "New York, USA", score: 85, intent: "High", tier: "high", engagement: "Active", engColor: "#16a34a", eng: rising, lastSignal: "1h ago", dot: "#16a34a", revenue: "$10M - $25M", employees: "201 - 500" },
  { logo: "FE", bg: "#0d9488", name: "FinEdge Technologies", fav: false, industry: "FinTech", flag: "🇮🇳", location: "Mumbai, India", score: 78, intent: "Medium", tier: "medium", engagement: "Engaged", engColor: "#f97316", eng: wavy, lastSignal: "1d ago", dot: "#f97316", revenue: "$25M - $50M", employees: "501 - 1,000" },
  { logo: "GR", bg: "#ef4444", name: "Global Retail Group", fav: true, industry: "Retail", flag: "🇬🇧", location: "London, UK", score: 74, intent: "Medium", tier: "medium", engagement: "Engaged", engColor: "#f97316", eng: wavy, lastSignal: "2d ago", dot: "#94a3b8", revenue: "$100M - $250M", employees: "2,501 - 5,000" },
  { logo: "SN", bg: "#6366f1", name: "SecureNet Systems", fav: false, industry: "Cybersecurity", flag: "🇮🇱", location: "Tel Aviv, Israel", score: 71, intent: "Medium", tier: "medium", engagement: "Active", engColor: "#16a34a", eng: rising, lastSignal: "3h ago", dot: "#16a34a", revenue: "$10M - $25M", employees: "201 - 500" },
  { logo: "HP", bg: "#10b981", name: "HealthPlus Solutions", fav: false, industry: "Healthcare", flag: "🇺🇸", location: "Boston, USA", score: 65, intent: "Low", tier: "low", engagement: "Dormant", engColor: "#ef4444", eng: falling, lastSignal: "5d ago", dot: "#ef4444", revenue: "$25M - $50M", employees: "501 - 1,000" },
  { logo: "EB", bg: "#3b82f6", name: "EduBridge Technologies", fav: true, industry: "EdTech", flag: "🇸🇬", location: "Singapore", score: 62, intent: "Low", tier: "low", engagement: "Engaged", engColor: "#f97316", eng: wavy, lastSignal: "4d ago", dot: "#94a3b8", revenue: "$5M - $10M", employees: "51 - 200" },
  { logo: "MI", bg: "#334155", name: "Manufacto India Pvt Ltd", fav: false, industry: "Manufacturing", flag: "🇮🇳", location: "Pune, India", score: 58, intent: "Low", tier: "low", engagement: "Dormant", engColor: "#94a3b8", eng: falling, lastSignal: "7d ago", dot: "#94a3b8", revenue: "$10M - $25M", employees: "201 - 500" },
  { logo: "EC", bg: "#f97316", name: "EnergyCore Enterprises", fav: false, industry: "Energy", flag: "🇺🇸", location: "Houston, USA", score: 55, intent: "Low", tier: "low", engagement: "Dormant", engColor: "#ef4444", eng: falling, lastSignal: "8d ago", dot: "#94a3b8", revenue: "$50M - $100M", employees: "1,001 - 2,500" },
];

const intentTones: Record<string, string> = {
  high: "text-[#16a34a]",
  medium: "text-[#f97316]",
  low: "text-[#2563eb]",
};

function IntentTag({ intent, tier }: { intent: string; tier: string }) {
  const Icon = tier === "medium" ? Flame : ArrowUpRight;
  return (
    <span className={cn("inline-flex items-center gap-[6px] text-[13px] font-semibold", intentTones[tier])}>
      <Icon className="size-[15px]" />
      {intent}
    </span>
  );
}

const cols =
  "grid-cols-[28px_minmax(0,1.7fr)_0.9fr_1.2fr_1.15fr_1fr_1.2fr_0.85fr_1.1fr_0.95fr_40px]";

function EnterpriseTable({ enterprises }: { enterprises: Enterprise[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1240px]">
        <div className={cn("grid items-center gap-[12px] border-b border-[#eef1f6] px-[8px] pb-[12px] text-[12px] font-semibold text-[#94a3b8]", cols)}>
          <span><input aria-label="Select all" className="size-[16px] rounded-[4px] border-[#cbd5e1]" type="checkbox" /></span>
          <span>Enterprise Name</span>
          <span>Industry</span>
          <span>Location</span>
          <span className="flex items-center gap-[4px]">Enterprise Score <ChevronDown className="size-[13px]" /></span>
          <span>Intent Level</span>
          <span>Engagement</span>
          <span>Last Signal</span>
          <span>Revenue</span>
          <span>Employees</span>
          <span className="text-right">Actions</span>
        </div>

        <div className="divide-y divide-[#f1f5f9]">
          {enterprises.map((e) => (
            <div
              className={cn("grid cursor-pointer items-center gap-[12px] rounded-[8px] px-[8px] py-[13px] transition hover:bg-[#fafbff]", cols)}
              key={e.companyId ?? e.name}
              onClick={() => {
                window.location.href = e.companyId
                  ? `/enterprise-detail?id=${e.companyId}`
                  : "/enterprise-detail";
              }}
              role="button"
              tabIndex={0}
            >
              <input
                aria-label={`Select ${e.name}`}
                className="size-[16px] rounded-[4px] border-[#cbd5e1]"
                onClick={(event) => event.stopPropagation()}
                type="checkbox"
              />

              <div className="flex min-w-0 items-center gap-[10px]">
                <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] text-[11px] font-bold text-white" style={{ backgroundColor: e.bg }}>
                  {e.logo}
                </span>
                <span className="truncate text-[14px] font-semibold text-[#0f172a]">{e.name}</span>
                <Star className={cn("size-[15px] shrink-0", e.fav ? "fill-[#f59e0b] text-[#f59e0b]" : "text-[#cbd5e1]")} />
              </div>

              <span className="truncate text-[13px] text-[#475569]">{e.industry}</span>

              <span className="flex items-center gap-[7px] truncate text-[13px] text-[#475569]">
                <span className="text-[15px] leading-none">{e.flag}</span>
                {e.location}
              </span>

              <div className="flex items-center gap-[10px]">
                <span className="w-[24px] text-[14px] font-bold text-[#0f172a]">{e.score}</span>
                <span className="h-[6px] flex-1 rounded-full bg-[#e5e7eb]">
                  <span className="block h-full rounded-full bg-[#22c55e]" style={{ width: `${e.score}%` }} />
                </span>
              </div>

              <IntentTag intent={e.intent} tier={e.tier} />

              <span className="flex items-center gap-[8px]">
                <span className="flex items-center gap-[6px] text-[13px] font-medium text-[#334155]">
                  <span className="size-[7px] rounded-full" style={{ backgroundColor: e.engColor }} />
                  {e.engagement}
                </span>
                <Sparkline className="h-[20px] w-[46px]" color={e.engColor} gradientId={`eng-${e.logo}`} values={e.eng} />
              </span>

              <span className="flex items-center gap-[7px] text-[13px] text-[#64748b]">
                <span className="size-[7px] rounded-full" style={{ backgroundColor: e.dot }} />
                {e.lastSignal}
              </span>

              <span className="text-[13px] text-[#475569]">{e.revenue}</span>
              <span className="text-[13px] text-[#475569]">{e.employees}</span>

              <button aria-label={`Actions for ${e.name}`} className="flex size-[32px] items-center justify-center justify-self-end rounded-[8px] text-[#94a3b8] transition hover:bg-[#f6f7fb]" onClick={(event) => event.stopPropagation()} type="button">
                <MoreHorizontal className="size-[17px]" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pagination pieces                                                   */
/* ------------------------------------------------------------------ */

function PageBtn({ children, active = false, ariaLabel }: { children: ReactNode; active?: boolean; ariaLabel?: string }) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "flex size-[34px] items-center justify-center rounded-[9px] text-[13px] font-semibold transition",
        active ? "bg-[#5b3df5] text-white" : "border border-[#e9edf5] bg-white text-[#475569] hover:bg-[#f6f7fb]",
      )}
      type="button"
    >
      {children}
    </button>
  );
}

function PerPage() {
  return (
    <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[8px] text-[13px] font-semibold text-[#334155]" type="button">
      25 per page
      <ChevronDown className="size-[14px] text-[#94a3b8]" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function EnterpriseListPage() {
  const [enterprises, setEnterprises] = useState<Enterprise[]>(dummyEnterprises);
  const [icps, setIcps] = useState<IcpOut[]>([]);
  const [selectedIcpId, setSelectedIcpId] = useState("all");
  const [statCards, setStatCards] = useState<StatCard[]>(dummyStats);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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

  // Org-wide totals for the stat cards - independent of the ICP filter and
  // current page, so it always reflects every company from the uploaded data.
  useEffect(() => {
    const organisationId = getOrganisationId();
    if (!organisationId) {
      return;
    }
    getCompanyStats(organisationId)
      .then((data) => {
        if (data.total > 0) {
          setStatCards(toStatCards(data));
        }
      })
      .catch(() => {
        // No backend/org yet - keep the dummy stat cards.
      });
  }, []);

  // Reload the company list whenever the ICP filter changes - "all"
  // queries every company in the org (listCompanies); a specific ICP
  // queries only companies matching that ICP's filter criteria in SQL
  // (getIcpCompanies -> icp_filter.filter_companies), then merges in
  // lead scores separately since that endpoint doesn't join them.
  useEffect(() => {
    const organisationId = getOrganisationId();
    const workspaceId = getWorkspaceId();
    if (!organisationId) {
      return;
    }

    // Top lead score first, lowest last - the backend already orders "all
    // companies" this way (LeadScore.lead_score desc nulls last), but the
    // ICP-filtered branch below merges scores in JS after two separate
    // fetches, so it needs its own explicit sort.
    const byScoreDesc = (a: Enterprise, b: Enterprise) => b.score - a.score;

    if (selectedIcpId === "all") {
      listCompanies(organisationId, { page: 1, page_size: 25 })
        .then((res) => {
          if (res.items.length > 0) {
            setEnterprises(res.items.map((c) => toEnterprise(c, c.lead_score, c.gate_status)).sort(byScoreDesc));
          }
        })
        .catch(() => {
          // No backend/org yet - keep the dummy rows.
        });
      return;
    }

    if (!workspaceId) {
      return;
    }
    Promise.all([getIcpCompanies(workspaceId, selectedIcpId), getRankedScores(organisationId)])
      .then(([icpResult, ranked]) => {
        const scoreByName = new Map(ranked.map((r) => [r.company_name, r]));
        setEnterprises(
          icpResult.companies
            .map((c) => {
              const matched = scoreByName.get(c.company_name);
              return toEnterprise(c, matched?.lead_score ?? null, matched?.gate_status ?? null);
            })
            .sort(byScoreDesc),
        );
      })
      .catch(() => {
        // ICP has no matches yet, or the fetch failed - show nothing rather
        // than silently falling back to the unrelated dummy rows.
        setEnterprises([]);
      });
  }, [selectedIcpId]);

  // Exports the same set of companies currently shown - every company for
  // "All Companies", or just that ICP's matches when one is selected -
  // with real LeadScore columns (see excel_pipeline.build_company_export_workbook).
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
        <TopBar searchPlaceholder="Search companies, triggers, executives..." showDetection={false} />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          <div className="flex flex-col gap-[16px] xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="m-0 text-[26px] font-bold text-[#0f172a]">Enterprise List</h1>
              <p className="m-0 mt-[6px] text-[15px] text-[#64748b]">
                Manage and explore all enterprises in your database.
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
                <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-semibold text-[#334155]" type="button">
                  <Upload className="size-[16px] text-[#64748b]" />
                  Import
                </button>
                <button className="flex items-center gap-[8px] rounded-[10px] bg-[#fa5a1e] px-[18px] py-[10px] text-[14px] font-semibold text-white shadow-[0px_10px_20px_-6px_rgba(250,90,30,0.5)]" type="button">
                  <Plus className="size-[17px]" />
                  Add Enterprise
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
              <Toolbar icps={icps} onIcpChange={setSelectedIcpId} selectedIcpId={selectedIcpId} />
            </div>

            <div className="mt-[16px] flex flex-wrap items-center justify-end gap-[12px]">
              <span className="text-[13px] text-[#64748b]">Showing 1 - 25 of 3,842 enterprises</span>
              <PerPage />
              <div className="flex items-center gap-[6px]">
                <PageBtn ariaLabel="Previous page"><ChevronLeft className="size-[16px]" /></PageBtn>
                <PageBtn active>1</PageBtn>
                <PageBtn ariaLabel="Next page"><ChevronRight className="size-[16px]" /></PageBtn>
                <span className="ml-[4px] text-[13px] text-[#64748b]">of 154</span>
              </div>
            </div>

            <div className="mt-[16px]">
              <EnterpriseTable enterprises={enterprises} />
            </div>

            <div className="mt-[18px] flex flex-col items-center gap-[16px] border-t border-[#f1f5f9] pt-[18px] lg:flex-row lg:justify-between">
              <span className="text-[13px] text-[#64748b]">Showing 1 - 25 of 3,842 enterprises</span>
              <div className="flex items-center gap-[6px]">
                <PageBtn ariaLabel="Previous page"><ChevronLeft className="size-[16px]" /></PageBtn>
                <PageBtn active>1</PageBtn>
                <PageBtn>2</PageBtn>
                <PageBtn>3</PageBtn>
                <PageBtn>4</PageBtn>
                <PageBtn>5</PageBtn>
                <span className="px-[4px] text-[14px] text-[#94a3b8]">…</span>
                <PageBtn>154</PageBtn>
                <PageBtn ariaLabel="Next page"><ChevronRight className="size-[16px]" /></PageBtn>
              </div>
              <PerPage />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
