import {
  Calendar,
  ChevronDown,
  DollarSign,
  Flame,
  Info,
  Mail,
  Maximize2,
  Radio,
  Send,
  Target,
} from "lucide-react";
import { lazy, Suspense } from "react";
import earthImage from "../../assets/earth.png";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Delta, FLAT_LINE, Sparkline, UpTriangle, smoothPath } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";
import { useEffect, useRef, useState } from "react";
import { getRankedScores, type RankedLeadScoreOut } from "../../api/scores";
import { getCompanyStats, type CompanyStatsOut } from "../../api/companies";
import { getSignalStats, listSignals, type SignalStatsOut, type SignalWithCompanyOut } from "../../api/signals";
import { listImportBatches, type ImportBatchOut } from "../../api/icp";
import { listWorkspaceMembers } from "../../api/workspaces";
import { getOrganisationId, getWorkspaceId } from "../../lib/session";

/* Exact upload timestamp, not a relative/rounded one - the user explicitly
 * wants to pick "the exact time" an Excel was uploaded, not a day bucket. */
function formatExactTimestamp(iso: string | null): string {
  if (!iso) return "Unknown time";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* Dashboard's timeline picker - lets a user pin every stat/chart/prospect
 * list on the page to one specific Excel upload instead of the org's whole
 * history. null selection means "All Time" (every company ever ingested). */
function TimelinePicker({
  batches,
  selectedBatchId,
  onSelect,
}: {
  batches: ImportBatchOut[];
  selectedBatchId: string | null;
  onSelect: (batchId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
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

  const selected = batches.find((b) => b.import_batch_id === selectedBatchId);
  const label = selected ? formatExactTimestamp(selected.created_at) : "All Time";

  return (
    <div className="relative" ref={rootRef}>
      <button
        className="flex shrink-0 items-center gap-[10px] rounded-[12px] border border-[#e9edf5] bg-white px-[16px] py-[11px] text-[14px] font-semibold text-[#0f172a]"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <Calendar className="size-[17px] text-[#64748b]" />
        {label}
        <ChevronDown className="size-[15px] text-[#94a3b8]" />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 max-h-[320px] w-[280px] overflow-y-auto rounded-[12px] border border-[#e9edf5] bg-white py-[6px] shadow-[0px_8px_20px_rgba(15,23,42,0.12)]">
          <button
            className="flex w-full items-center justify-between gap-[8px] px-[14px] py-[10px] text-left text-[13px] font-semibold text-[#334155] hover:bg-[#f8fafc]"
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
            type="button"
          >
            All Time
            {selectedBatchId === null && <span className="text-[#005bff]">•</span>}
          </button>
          {batches.length === 0 && (
            <p className="m-0 px-[14px] py-[10px] text-[12px] text-[#94a3b8]">No uploads yet.</p>
          )}
          {batches.map((batch) => (
            <button
              className="flex w-full flex-col items-start gap-[2px] px-[14px] py-[10px] text-left hover:bg-[#f8fafc]"
              key={batch.import_batch_id}
              onClick={() => {
                onSelect(batch.import_batch_id);
                setOpen(false);
              }}
              type="button"
            >
              <span className="flex w-full items-center justify-between gap-[8px] text-[13px] font-semibold text-[#334155]">
                {formatExactTimestamp(batch.created_at)}
                {batch.import_batch_id === selectedBatchId && <span className="text-[#005bff]">•</span>}
              </span>
              <span className="truncate text-[11px] text-[#94a3b8]">
                {batch.file_names?.[0] ?? "Upload"} · {batch.companies_ingested} companies
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/* RankedLeadScoreOut has no revenue/next-best-action - those are UI-only
 * concepts (revenue would need a join the ranked-scores endpoint doesn't
 * do; "next best action" has no backend concept at all). Real
 * name/score/sales_status come from the API. */
function toProspect(row: RankedLeadScoreOut) {
  const score = row.lead_score !== null ? Math.round(row.lead_score) : 0;
  const initials = row.company_name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  const status = row.sales_status ?? "Low Priority";
  const strong = status === "Sales Ready" || status === "High Priority";
  return {
    initials: initials || "?",
    company: row.company_name,
    revenue: row.best_offering ?? "—",
    action: status,
    tone: strong ? "blue" : "orange",
    score,
    ring: score >= 75 ? "green" : "orange",
  };
}

/* Same company-color-hash approach as SignalFeedPage's LOGO_COLORS/hashString
 * - same company always gets the same color across pages, and different
 * companies are visually distinguishable instead of one flat blue for every
 * row. */
const AVATAR_COLORS = ["#16a34a", "#2563eb", "#7c3aed", "#0d9488", "#ef4444", "#6366f1", "#10b981", "#3b82f6", "#334155", "#f97316"];

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

/* SignalWithCompanyOut has no action-tag vocabulary - that's UI-only. Real
 * company/time/score come from the API (BuyingEvent-backed). event_score
 * (how strong this specific buying signal is) is what Signal Feed's own
 * "Score" column shows for the same data - using extraction_confidence here
 * instead, as this used to, showed a different metric under an identical
 * label depending which page you were on. */
function toRecentSignal(s: SignalWithCompanyOut) {
  const score = Math.round(s.event_score ?? 0);
  return {
    signalId: s.buying_event_id,
    time: relativeTime(s.published_at),
    company: s.company_name,
    action: s.event_type.replace(/_/g, " "),
    tone: "blue",
    score,
    ring: score >= 60 ? "green" : "orange",
    initials: initialsOf(s.company_name) || "?",
    avatarColor: AVATAR_COLORS[hashString(s.company_name) % AVATAR_COLORS.length],
  };
}

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

/* ------------------------------------------------------------------ */
/* Dashboard-specific primitives                                       */
/* ------------------------------------------------------------------ */

const tagTones: Record<string, string> = {
  blue: "bg-[#e2edff] text-[#005bff]",
  red: "bg-[#fee2e2] text-[#ef4444]",
  purple: "bg-[#f3e8ff] text-[#7c3aed]",
  orange: "bg-[#ffedd5] text-[#f97316]",
};

function Tag({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-[6px] px-[9px] py-[3px] text-[11px] font-semibold leading-[16px]",
        tagTones[tone],
      )}
    >
      {label}
    </span>
  );
}

const ringTones: Record<string, string> = {
  green: "border-[#16a34a] text-[#16a34a]",
  orange: "border-[#f97316] text-[#f97316]",
};

function ScoreRing({ score, tone }: { score: number; tone: string }) {
  return (
    <span
      className={cn(
        "flex size-[38px] shrink-0 items-center justify-center rounded-full border-[2px] text-[13px] font-bold",
        ringTones[tone],
      )}
    >
      {score}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Charts (inline SVG)                                                 */
/* ------------------------------------------------------------------ */

const emptyTrend: SignalStatsOut["trend"] = [];

/* Real SignalStatsOut.trend (see api/signals.ts) - one point per day with
 * high/medium/low confidence-tier counts, exactly the 3-series shape this
 * chart already drew with fake data. */
function TrendChart({ trend }: { trend: SignalStatsOut["trend"] }) {
  const w = 580;
  const h = 250;
  const left = 34;
  const right = w - 14;
  const top = 14;
  const bottom = 205;

  const series = [
    { color: "#7c3aed", values: trend.map((t) => t.high) },
    { color: "#f97316", values: trend.map((t) => t.medium) },
    { color: "#2563eb", values: trend.map((t) => t.low) },
  ];
  const labels = trend.map((t) => new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  const yMax = Math.max(10, ...trend.map((t) => t.high), ...trend.map((t) => t.medium), ...trend.map((t) => t.low)) * 1.15;
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));

  const xOf = (i: number) => left + (i * (right - left)) / Math.max(1, labels.length - 1);
  const yOf = (v: number) => bottom - (v / yMax) * (bottom - top);

  if (trend.length === 0) {
    return (
      <div className="flex h-[250px] items-center justify-center text-[13px] text-[#94a3b8]">
        No signal history yet.
      </div>
    );
  }

  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        {series.map((s, i) => (
          <linearGradient id={`trend-${i}`} key={i} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.14" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>

      {gridValues.map((v) => (
        <g key={v}>
          <line stroke="#eef2f7" strokeWidth="1" x1={left} x2={right} y1={yOf(v)} y2={yOf(v)} />
          <text fill="#94a3b8" fontSize="11" textAnchor="end" x={left - 8} y={yOf(v) + 4}>
            {v}
          </text>
        </g>
      ))}

      {series.map((s, i) => {
        const pts = s.values.map((v, idx) => ({ x: xOf(idx), y: yOf(v) }));
        const line = smoothPath(pts);
        // smoothPath returns "" for fewer than 2 points (nothing to draw a
        // line between) - closing that into an area path would start with
        // "L" instead of "M", which is invalid SVG and throws at render time.
        const area = pts.length > 1 ? `${line} L ${pts[pts.length - 1].x} ${bottom} L ${pts[0].x} ${bottom} Z` : "";

        return (
          <g key={i}>
            <path d={area} fill={`url(#trend-${i})`} />
            <path d={line} fill="none" stroke={s.color} strokeLinecap="round" strokeWidth="2.5" />
            {pts.map((p, idx) => (
              <circle cx={p.x} cy={p.y} fill="#ffffff" key={idx} r="3.4" stroke={s.color} strokeWidth="2" />
            ))}
          </g>
        );
      })}

      {labels.map((label, i) => (
        <text
          fill="#94a3b8"
          fontSize="11"
          key={`${label}-${i}`}
          textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
          x={xOf(i)}
          y={bottom + 26}
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

/* Real signalStats.trend daily totals, normalized to bar heights - replaces
 * the old fully-fabricated miniBarHeights array. */
function MiniBars({ trend }: { trend: SignalStatsOut["trend"] }) {
  const totals = trend.slice(-14).map((t) => t.total);
  const max = Math.max(1, ...totals);

  if (totals.length === 0) {
    return null;
  }

  return (
    <div className="flex h-[38px] items-end gap-[3px]">
      {totals.map((total, i) => (
        <span
          className="w-[5px] rounded-[2px] bg-gradient-to-t from-[#7c3aed] to-[#c084fc]"
          key={i}
          style={{ height: `${Math.max(6, (total / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat cards                                                          */
/* ------------------------------------------------------------------ */

/* Same 5 icon slots as before - "Pipeline Value"/"Meetings Booked"/
 * "Conversion Rate" had no backend concept at all (no deals/meetings model
 * exists), so those 3 now show real CompanyStatsOut/SignalStatsOut numbers
 * instead. Dropped the fake per-card delta - there's no stored history to
 * compute a real "vs last 7 days" change from.
 *
 * Sparklines: "New Signals" plots the real daily signal totals
 * (signalStats.trend); the other four are point-in-time counts/averages with
 * no day-over-day history, so they render a flat line rather than a fake
 * trend. */
function StatCards({ companyStats, signalStats }: { companyStats: CompanyStatsOut; signalStats: SignalStatsOut }) {
  const newSignalsSeries =
    signalStats.trend.length >= 2 ? signalStats.trend.map((t) => t.total) : FLAT_LINE;

  const pipeline = companyStats.provisional_pipeline_value;
  const pipelineLabel = pipeline >= 1_000_000 ? `$${(pipeline / 1_000_000).toFixed(1)}M` : `$${Math.round(pipeline / 1000)}K`;
  const stats = [
    { icon: Flame, iconBg: "bg-[#e7f8ef]", iconColor: "text-[#16a34a]", label: "Sales Ready", value: String(companyStats.sales_ready), spark: "#16a34a", values: FLAT_LINE },
    { icon: Target, iconBg: "bg-[#fff1e8]", iconColor: "text-[#f97316]", label: "High Priority", value: String(companyStats.high_priority), spark: "#f97316", values: FLAT_LINE },
    { icon: DollarSign, iconBg: "bg-[#e8f0ff]", iconColor: "text-[#2563eb]", label: "Total Companies", value: String(companyStats.total), spark: "#2563eb", values: FLAT_LINE },
    { icon: Radio, iconBg: "bg-[#f3e8ff]", iconColor: "text-[#7c3aed]", label: "High Confidence", value: String(companyStats.high_confidence), spark: "#7c3aed", values: newSignalsSeries },
    { icon: Calendar, iconBg: "bg-[#e8f0ff]", iconColor: "text-[#2563eb]", label: "Est. Pipeline Value", value: pipelineLabel, spark: "#2563eb", values: FLAT_LINE },
  ];

  return (
    <div className="grid grid-cols-2 gap-[16px] sm:grid-cols-3 xl:grid-cols-5">
      {stats.map((stat) => {
        const Icon = stat.icon;

        return (
          <div
            className="rounded-[16px] border border-[#eef1f6] bg-white p-[18px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]"
            key={stat.label}
          >
            <div className="flex items-center gap-[10px]">
              <span
                className={cn(
                  "flex size-[40px] shrink-0 items-center justify-center rounded-[10px]",
                  stat.iconBg,
                )}
              >
                <Icon className={cn("size-[20px]", stat.iconColor)} />
              </span>
              <span className="text-[14px] font-semibold text-[#475569]">
                {stat.label}
              </span>
            </div>

            <div className="mt-[14px] flex items-end gap-[8px]">
              <span className="text-[30px] font-bold leading-none text-[#0f172a]">
                {stat.value}
              </span>
            </div>

            {stat.values && (
              <div className="mt-[8px]">
                <Sparkline
                  className="h-[36px] w-full"
                  color={stat.spark!}
                  gradientId={`dash-${stat.label.replace(/\s+/g, "")}`}
                  values={stat.values}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* StatCards above only has room for 5 slots and mixes org-level KPIs (Total
 * Companies/High Confidence/Est. Pipeline Value) in with 2 of the 5 sales
 * statuses (Sales Ready/High Priority) - this strip surfaces the remaining 3
 * (Warm/Monitor/Low Priority) so every status band has a visible count
 * somewhere on the Dashboard, matching the same 5-band thresholds shown in
 * the Lead Opportunity Map legend below. */
function SalesStatusBreakdown({ companyStats }: { companyStats: CompanyStatsOut }) {
  const items = [
    { label: "Warm", value: companyStats.warm, color: "#f97316", bg: "#fff1e8" },
    { label: "Monitor", value: companyStats.monitor, color: "#eab308", bg: "#fef9e7" },
    { label: "Low Priority", value: companyStats.low_priority, color: "#94a3b8", bg: "#f1f5f9" },
  ];
  return (
    <div className="mt-[12px] grid grid-cols-3 gap-[12px]">
      {items.map((item) => (
        <div
          className="flex items-center justify-between rounded-[12px] border border-[#eef1f6] bg-white px-[16px] py-[12px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]"
          key={item.label}
        >
          <span className="flex items-center gap-[8px] text-[13px] font-semibold text-[#475569]">
            <span className="size-[9px] rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
          <span className="text-[16px] font-bold text-[#0f172a]">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lead Opportunity Map (dark card)                                    */
/* ------------------------------------------------------------------ */

/* Ranges mirror cfg.SALES_STATUS_BANDS - keep in sync with it and with
 * LeadGlobe's zoneForScore (all three were left at the pre-recalibration
 * 85/70/50/30 values once already). */
const mapLegend = [
  { label: "Sales Ready", range: "65-100", color: "#16a34a" },
  { label: "High Priority", range: "50-64", color: "#22c55e" },
  { label: "Warm", range: "35-49", color: "#f97316" },
  { label: "Monitor", range: "20-34", color: "#eab308" },
  { label: "Low Priority", range: "0-19", color: "#94a3b8" },
];

const LeadGlobe = lazy(() => import("./LeadGlobe"));

const globeFallback = (
  <img
    alt=""
    className="pointer-events-none absolute -right-[2%] top-1/2 h-auto w-[66%] max-w-none -translate-y-1/2 select-none"
    draggable={false}
    src={earthImage}
  />
);

function LeadOpportunityMap({
  companyStats,
  signalStats,
  topProspect,
}: {
  companyStats: CompanyStatsOut;
  signalStats: SignalStatsOut;
  topProspect: ReturnType<typeof toProspect> | null;
}) {
  return (
    <section className="relative flex min-h-[420px] flex-col overflow-hidden rounded-[18px] bg-[#0a1020] p-[24px] text-white">
      <div className="absolute inset-0 z-0">
        <Suspense fallback={globeFallback}>
          <LeadGlobe countryData={companyStats.by_country} />
        </Suspense>
      </div>

      <div className="relative z-10 flex items-center gap-[8px]">
        <h2 className="m-0 text-[18px] font-bold">Lead Opportunity Map</h2>
        <Info className="size-[15px] text-[#94a3b8]" />
      </div>
      <p className="relative z-10 m-0 mt-[6px] max-w-[280px] text-[12px] leading-[18px] text-[#94a3b8]">
        Real-time view of high-potential leads globally based on signal intensity
        &amp; Lead Score.
      </p>

      <div className="relative z-10 mt-[18px] w-fit rounded-[12px] border border-white/10 bg-white/5 p-[14px] backdrop-blur-sm">
        <div className="grid grid-cols-1 gap-[10px]">
          {mapLegend.map((item) => (
            <div className="flex items-center gap-[10px]" key={item.label}>
              <span
                className="flex size-[14px] items-center justify-center rounded-full"
                style={{ boxShadow: `0 0 0 3px ${item.color}33` }}
              >
                <span
                  className="size-[10px] rounded-full"
                  style={{ backgroundColor: item.color }}
                />
              </span>
              <div className="leading-tight">
                <p className="m-0 text-[12px] font-semibold text-white">
                  {item.label}
                </p>
                <p className="m-0 text-[11px] text-[#94a3b8]">{item.range}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {topProspect && (
        <div className="absolute right-[26px] top-[150px] z-10 hidden w-[220px] rounded-[12px] border border-white/10 bg-[#111a2e]/85 p-[14px] backdrop-blur-sm sm:block">
          <p className="m-0 text-[13px] font-bold text-white">{topProspect.company}</p>
          <p className="m-0 mt-[6px] text-[11px] text-[#cbd5e1]">
            Lead Score <span className="font-bold text-white">{topProspect.score}</span> •{" "}
            <span className="text-[#f97316]">Top Match</span>
          </p>
          <div className="mt-[10px] flex items-center justify-between">
            <span className="text-[11px] text-[#94a3b8]">{topProspect.action}</span>
            <span className="flex size-[26px] items-center justify-center rounded-full bg-gradient-to-r from-[#f5417f] to-[#c531d6] text-white">
              <Send className="size-[13px]" />
            </span>
          </div>
        </div>
      )}

      <div className="relative z-10 mt-auto flex flex-col gap-[14px] pt-[22px] lg:flex-row lg:items-end lg:justify-between">
        <div className="w-fit rounded-[12px] border border-white/10 bg-white/5 p-[14px] backdrop-blur-sm">
          <p className="m-0 text-[12px] text-[#94a3b8]">Live Opportunities</p>
          <div className="mt-[4px] flex items-end gap-[10px]">
            <span className="text-[26px] font-bold leading-none text-white">
              {companyStats.total.toLocaleString()}
            </span>
            <MiniBars trend={signalStats.trend} />
          </div>
        </div>

        <div className="flex items-end gap-[8px]">
          <div className="rounded-[10px] border border-white/10 bg-white/5 px-[12px] py-[8px] backdrop-blur-sm">
            <p className="m-0 text-[10px] text-[#94a3b8]">View by:</p>
            <button
              className="mt-[2px] flex items-center gap-[8px] text-[13px] font-semibold text-white"
              type="button"
            >
              Lead Score
              <ChevronDown className="size-[14px] text-[#94a3b8]" />
            </button>
          </div>
          <div className="rounded-[10px] border border-white/10 bg-white/5 px-[12px] py-[8px] backdrop-blur-sm">
            <p className="m-0 text-[10px] text-[#94a3b8]">Industry:</p>
            <button
              className="mt-[2px] flex items-center gap-[8px] text-[13px] font-semibold text-white"
              type="button"
            >
              All Industries
              <ChevronDown className="size-[14px] text-[#94a3b8]" />
            </button>
          </div>
          <button
            aria-label="Expand map"
            className="flex size-[40px] items-center justify-center rounded-[10px] border border-white/10 bg-white/5 text-white backdrop-blur-sm"
            type="button"
          >
            <Maximize2 className="size-[16px]" />
          </button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Lead Trend                                                          */
/* ------------------------------------------------------------------ */

function LeadTrend({ signalStats }: { signalStats: SignalStatsOut }) {
  const trend = signalStats.trend;
  const firstTotal = trend[0]?.total ?? 0;
  const lastTotal = trend[trend.length - 1]?.total ?? 0;
  const delta = firstTotal > 0 ? `${Math.round(((lastTotal - firstTotal) / firstTotal) * 100)}%` : null;

  const trendBuckets = [
    { label: "High", value: String(signalStats.high_relevance), className: "bg-[#f5f3ff] text-[#7c3aed]" },
    { label: "Medium", value: String(signalStats.medium_relevance), className: "bg-[#fff7ed] text-[#f97316]" },
    { label: "Low", value: String(signalStats.low_relevance), className: "bg-[#eff6ff] text-[#2563eb]" },
  ];

  return (
    <section className="flex flex-col rounded-[18px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[18px] font-bold text-[#0f172a]">Signal Trends</h2>

      <div className="mt-[14px] flex items-center gap-[10px]">
        <span className="text-[26px] font-bold leading-none text-[#0f172a]">{signalStats.total}</span>
        <span className="text-[14px] font-semibold text-[#64748b]">Total Signals</span>
      </div>
      {delta && (
        <p className="m-0 mt-[8px] flex items-center gap-[8px] text-[12px] text-[#94a3b8]">
          <Delta value={delta} />
          over this period
        </p>
      )}

      <div className="mt-[10px] flex-1">
        <TrendChart trend={trend} />
      </div>

      <div className="mt-[16px] grid grid-cols-3 gap-[14px]">
        {trendBuckets.map((bucket) => (
          <div
            className={cn("rounded-[12px] px-[16px] py-[14px]", bucket.className)}
            key={bucket.label}
          >
            <p className="m-0 text-[13px] font-semibold opacity-80">
              {bucket.label}
            </p>
            <p className="m-0 mt-[4px] text-[24px] font-bold leading-none">
              {bucket.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Top Priority Prospects                                              */
/* ------------------------------------------------------------------ */

const dummyProspects = [
  {
    initials: "ABC",
    company: "ABC Accounting Group",
    revenue: "$12M Revenue",
    action: "New Lead Joined",
    tone: "blue",
    score: 92,
    ring: "green",
  },
  {
    initials: "TA",
    company: "Thomson & Associates",
    revenue: "$64M Revenue",
    action: "PE Acquisition",
    tone: "red",
    score: 89,
    ring: "green",
  },
  {
    initials: "JL",
    company: "Johnson Lambert LLP",
    revenue: "$99M Revenue",
    action: "Competitor AI Move",
    tone: "purple",
    score: 78,
    ring: "orange",
  },
  {
    initials: "WBC",
    company: "Williams & Co. LLP",
    revenue: "$60M Revenue",
    action: "Hiring Freeze",
    tone: "orange",
    score: 72,
    ring: "orange",
  },
  {
    initials: "BT",
    company: "Baker Tilly US",
    revenue: "$350M Revenue",
    action: "Regulatory Change",
    tone: "blue",
    score: 68,
    ring: "orange",
  },
];

function TopPriorityProspects({ prospects }: { prospects: typeof dummyProspects }) {
  return (
    <section className="rounded-[18px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[17px] font-bold text-[#0f172a]">
          Top Priority Prospects
        </h2>
        <a className="text-[13px] font-semibold text-[#2563eb] no-underline" href="/enterprise-list">
          View All
        </a>
      </div>

      <div className="mt-[16px] grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-[16px] border-b border-[#eef1f6] pb-[10px] text-[11px] font-semibold uppercase tracking-[0.02em] text-[#94a3b8]">
        <span>Company</span>
        <span className="text-center">Lead Score</span>
        <span className="text-center">Trend</span>
        <span className="whitespace-nowrap">Next Best Action</span>
      </div>

      <div className="divide-y divide-[#f1f5f9]">
        {prospects.map((row, i) => (
          <div
            className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-[16px] py-[12px]"
            key={`${row.company}-${i}`}
          >
            <div className="flex min-w-0 items-center gap-[12px]">
              <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-[#0f172a] text-[11px] font-bold text-white">
                {row.initials}
              </span>
              <div className="min-w-0">
                <p className="m-0 truncate text-[14px] font-bold text-[#0f172a]">
                  {row.company}
                </p>
                <p className="m-0 text-[12px] text-[#94a3b8]">{row.revenue}</p>
                <span className="mt-[5px] inline-flex">
                  <Tag label={row.action} tone={row.tone} />
                </span>
              </div>
            </div>
            <div className="flex justify-center">
              <ScoreRing score={row.score} tone={row.ring} />
            </div>
            <div className="flex justify-center">
              <UpTriangle className="size-[13px] text-[#16a34a]" />
            </div>
            <div className="flex items-center gap-[8px]">
              <button
                className="whitespace-nowrap text-[13px] font-semibold text-[#2563eb]"
                type="button"
              >
                Contact Now
              </button>
              <button
                aria-label={`Email ${row.company}`}
                className="flex size-[30px] items-center justify-center rounded-[8px] border border-[#e9edf5] text-[#64748b]"
                type="button"
              >
                <Mail className="size-[15px]" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Recent Signals                                                      */
/* ------------------------------------------------------------------ */

const dummyRecentSignals = [
  {
    signalId: "",
    time: "2m ago",
    company: "Thomson & Associates",
    action: "PE Acquisition",
    tone: "red",
    score: 95,
    ring: "green",
    initials: initialsOf("Thomson & Associates"),
    avatarColor: "#db2777",
  },
  {
    signalId: "",
    time: "15m ago",
    company: "ABC Accounting Group",
    action: "New Lead Joined",
    tone: "blue",
    score: 92,
    ring: "green",
    initials: initialsOf("ABC Accounting Group"),
    avatarColor: "#2563eb",
  },
  {
    signalId: "",
    time: "1h ago",
    company: "Clifton Larson Allen",
    action: "Competitor AI Move",
    tone: "purple",
    score: 78,
    ring: "orange",
    initials: initialsOf("Clifton Larson Allen"),
    avatarColor: "#0f766e",
  },
  {
    signalId: "",
    time: "2h ago",
    company: "Plante Moran",
    action: "Hiring Freeze",
    tone: "orange",
    score: 69,
    ring: "orange",
    initials: initialsOf("Plante Moran"),
    avatarColor: "#f97316",
  },
  {
    signalId: "",
    time: "3h ago",
    company: "Crowe LLP",
    action: "Regulatory Change",
    tone: "blue",
    score: 65,
    ring: "orange",
    initials: initialsOf("Crowe LLP"),
    avatarColor: "#2563eb",
  },
];

function RecentSignals({ signals }: { signals: typeof dummyRecentSignals }) {
  return (
    <section className="rounded-[18px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[17px] font-bold text-[#0f172a]">Recent Signals</h2>
        <a className="text-[13px] font-semibold text-[#2563eb] no-underline" href="/signal-feed">
          View All
        </a>
      </div>

      <div className="mt-[8px] divide-y divide-[#f1f5f9]">
        {signals.map((signal, i) => (
          <div
            className={cn(
              "flex items-center gap-[12px] py-[13px]",
              signal.signalId && "cursor-pointer rounded-[10px] transition hover:bg-[#fafbff]",
            )}
            key={`${signal.company}-${i}`}
            onClick={() => {
              if (signal.signalId) {
                window.location.href = `/signal-detail?id=${signal.signalId}`;
              }
            }}
            role={signal.signalId ? "button" : undefined}
            tabIndex={signal.signalId ? 0 : undefined}
          >
            <span
              className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold text-white"
              style={{ backgroundColor: signal.avatarColor }}
            >
              {signal.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[11px] text-[#94a3b8]">{signal.time}</p>
              <p className="m-0 truncate text-[14px] font-bold text-[#0f172a]">
                {signal.company}
              </p>
              <span className="mt-[5px] inline-flex">
                <Tag label={signal.action} tone={signal.tone} />
              </span>
            </div>
            <ScoreRing score={signal.score} tone={signal.ring} />
          </div>
        ))}
      </div>
    </section>
  );
}


/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const emptyCompanyStats: CompanyStatsOut = { total: 0, scored: 0, unscored: 0, sales_ready: 0, high_priority: 0, warm: 0, monitor: 0, low_priority: 0, high_confidence: 0, provisional_pipeline_value: 0, by_country: [] };
const emptySignalStats: SignalStatsOut = {
  total: 0,
  high_relevance: 0,
  medium_relevance: 0,
  low_relevance: 0,
  company_count: 0,
  avg_confidence: 0,
  executives_impacted: 0,
  actionable_count: 0,
  by_category: [],
  trend: emptyTrend,
  top_signals: [],
  histogram: [],
  by_country: [],
  by_source: [],
};

export function DashboardPage() {
  const [prospects, setProspects] = useState<typeof dummyProspects>(dummyProspects);
  const [recentSignals, setRecentSignals] = useState<typeof dummyRecentSignals>(dummyRecentSignals);
  const [firstName, setFirstName] = useState("Arjun");
  const [companyStats, setCompanyStats] = useState<CompanyStatsOut>(emptyCompanyStats);
  const [signalStats, setSignalStats] = useState<SignalStatsOut>(emptySignalStats);
  const [importBatches, setImportBatches] = useState<ImportBatchOut[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  // Same "workspace owner" lookup as TopBar's UserMenu (see OnboardingPage's
  // Workspace Setup step: addWorkspaceMember(..., { role: "owner" })) - just
  // the first name for the greeting instead of the full name + role.
  useEffect(() => {
    const workspaceId = getWorkspaceId();
    if (!workspaceId) {
      return;
    }
    listWorkspaceMembers(workspaceId)
      .then((members) => {
        const owner = members.find((m) => m.role === "owner") ?? members[0];
        if (owner?.full_name) {
          setFirstName(owner.full_name.split(/\s+/)[0]);
        }
      })
      .catch(() => {
        // No backend/workspace yet - keep the dummy name.
      });
  }, []);

  // Every upload ever made in this workspace, for the timeline picker -
  // fetched once (independent of which one is currently selected).
  useEffect(() => {
    const workspaceId = getWorkspaceId();
    if (!workspaceId) return;
    listImportBatches(workspaceId)
      .then(setImportBatches)
      .catch(() => {
        // No backend/workspace yet - keep the empty list ("All Time" only).
      });
  }, []);

  useEffect(() => {
    const organisationId = getOrganisationId();
    if (!organisationId) {
      return;
    }
    const batchId = selectedBatchId ?? undefined;
    getRankedScores(organisationId, batchId)
      .then((rows) => {
        if (rows.length > 0) {
          setProspects(rows.slice(0, 5).map(toProspect));
        } else {
          setProspects([]);
        }
      })
      .catch(() => {
        // No backend/org yet - keep the dummy rows.
      });
    listSignals(organisationId, { page: 1, page_size: 5, import_batch_id: batchId })
      .then((res) => {
        setRecentSignals(res.items.length > 0 ? res.items.map(toRecentSignal) : []);
      })
      .catch(() => {
        // No backend/org yet - keep the dummy rows.
      });
    getCompanyStats(organisationId, batchId)
      .then(setCompanyStats)
      .catch(() => {
        // No backend/org yet - keep the empty stats.
      });
    getSignalStats(organisationId, batchId)
      .then(setSignalStats)
      .catch(() => {
        // No backend/org yet - keep the empty stats.
      });
  }, [selectedBatchId]);

  const topProspect = prospects !== dummyProspects ? prospects[0] ?? null : null;

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Dashboard" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          showDetection={false}
          showNotificationBell={false}
          showWorkspaceSwitcher
        />

        <main className="flex-1 overflow-x-hidden px-[24px] py-[24px]">
          <div className="flex items-start justify-between gap-[16px]">
            <div>
              <h1 className="m-0 text-[26px] font-bold text-[#0f172a]">
                Good morning, {firstName}!
              </h1>
              <p className="m-0 mt-[6px] text-[15px] text-[#64748b]">
                Here's what's happening across your pipeline today.
              </p>
            </div>
            <TimelinePicker batches={importBatches} onSelect={setSelectedBatchId} selectedBatchId={selectedBatchId} />
          </div>

          <div className="mt-[22px]">
            <StatCards companyStats={companyStats} signalStats={signalStats} />
            <SalesStatusBreakdown companyStats={companyStats} />
          </div>

          <div className="mt-[22px] grid grid-cols-1 gap-[20px] xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <LeadOpportunityMap companyStats={companyStats} signalStats={signalStats} topProspect={topProspect} />
            <LeadTrend signalStats={signalStats} />
          </div>

          <div className="mt-[22px] grid grid-cols-1 gap-[20px] xl:grid-cols-[1.35fr_1fr]">
            <TopPriorityProspects prospects={prospects} />
            <RecentSignals signals={recentSignals} />
          </div>

        </main>
      </div>
    </div>
  );
}
