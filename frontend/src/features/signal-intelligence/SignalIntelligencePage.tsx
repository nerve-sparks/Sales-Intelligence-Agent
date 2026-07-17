import {
  Activity,
  Aperture,
  ArrowRight,
  Briefcase,
  Building2,
  Calendar,
  ChevronDown,
  CircleDollarSign,
  Cloud,
  Crosshair,
  Database,
  DollarSign,
  Layers,
  Leaf,
  Linkedin,
  Newspaper,
  RefreshCw,
  Rocket,
  Snowflake,
  Target,
  UserPlus,
  Wrench,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Delta, Sparkline } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";
import { getSignalStats, type SignalStatsOut, type SignalWithCompanyOut } from "../../api/signals";
import { getOrganisationId } from "../../lib/session";
import { CATEGORY_COLORS, CATEGORY_LABELS, categoryStyle } from "../../lib/signalCategories";

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

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

type IconType = ComponentType<{ className?: string }>;

/* ------------------------------------------------------------------ */
/* Stat cards                                                          */
/* ------------------------------------------------------------------ */

type StatCard = {
  icon: IconType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  delta: string | null;
  color: string;
  values: number[];
};

const dummyStats: StatCard[] = [
  {
    icon: Target,
    iconBg: "bg-[#e8f0ff]",
    iconColor: "text-[#2563eb]",
    label: "Total Signals",
    value: "2,847",
    delta: "18.6%",
    color: "#2563eb",
    values: [42, 48, 44, 55, 50, 60, 52, 72, 58, 64],
  },
  {
    icon: Crosshair,
    iconBg: "bg-[#f3e8ff]",
    iconColor: "text-[#7c3aed]",
    label: "High-Intent Signals",
    value: "642",
    delta: "24.3%",
    color: "#7c3aed",
    values: [30, 36, 33, 42, 38, 48, 44, 60, 50, 56],
  },
  {
    icon: Activity,
    iconBg: "bg-[#fff1e8]",
    iconColor: "text-[#f97316]",
    label: "Medium-Intent Signals",
    value: "1,269",
    delta: "12.7%",
    color: "#f97316",
    values: [42, 36, 46, 38, 50, 34, 52, 40, 48, 40],
  },
  {
    icon: DollarSign,
    iconBg: "bg-[#e7f8ef]",
    iconColor: "text-[#16a34a]",
    label: "Low-Intent Signals",
    value: "936",
    delta: "6.2%",
    color: "#16a34a",
    values: [30, 40, 34, 46, 38, 50, 42, 58, 48, 54],
  },
];

/* SignalStatsOut has no vs-last-7-days baseline - deltas would have to be
 * fabricated. Where trend has enough real days to compare first-vs-last,
 * show a real delta; otherwise omit the line rather than invent one. */
function toStatCards(data: SignalStatsOut): StatCard[] {
  const trendLongEnough = data.trend.length >= 2;
  const deltaFor = (pickFrom: (p: SignalStatsOut["trend"][number]) => number): string | null => {
    if (!trendLongEnough) return null;
    const first = pickFrom(data.trend[0]);
    const last = pickFrom(data.trend[data.trend.length - 1]);
    if (first === 0) return null;
    return `${(((last - first) / first) * 100).toFixed(1)}%`;
  };
  const seriesFor = (pickFrom: (p: SignalStatsOut["trend"][number]) => number, flatValue: number): number[] =>
    trendLongEnough ? data.trend.map(pickFrom) : [flatValue, flatValue];

  return [
    {
      icon: Target,
      iconBg: "bg-[#e8f0ff]",
      iconColor: "text-[#2563eb]",
      label: "Total Signals",
      value: data.total.toLocaleString(),
      delta: deltaFor((p) => p.total),
      color: "#2563eb",
      values: seriesFor((p) => p.total, data.total),
    },
    {
      icon: Crosshair,
      iconBg: "bg-[#f3e8ff]",
      iconColor: "text-[#7c3aed]",
      label: "High-Intent Signals",
      value: data.high_intent.toLocaleString(),
      delta: deltaFor((p) => p.high),
      color: "#7c3aed",
      values: seriesFor((p) => p.high, data.high_intent),
    },
    {
      icon: Activity,
      iconBg: "bg-[#fff1e8]",
      iconColor: "text-[#f97316]",
      label: "Medium-Intent Signals",
      value: data.medium_intent.toLocaleString(),
      delta: deltaFor((p) => p.medium),
      color: "#f97316",
      values: seriesFor((p) => p.medium, data.medium_intent),
    },
    {
      icon: DollarSign,
      iconBg: "bg-[#e7f8ef]",
      iconColor: "text-[#16a34a]",
      label: "Low-Intent Signals",
      value: data.low_intent.toLocaleString(),
      delta: deltaFor((p) => p.low),
      color: "#16a34a",
      values: seriesFor((p) => p.low, data.low_intent),
    },
  ];
}

function StatCards({ stats }: { stats: StatCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 xl:grid-cols-4">
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

            <div className="mt-[12px] flex items-center justify-between gap-[12px]">
              <span className="text-[30px] font-bold leading-none text-[#0f172a]">
                {stat.value}
              </span>
              <Sparkline
                className="h-[44px] w-[46%]"
                color={stat.color}
                gradientId={`sig-spark-${stat.label.replace(/\s+/g, "")}`}
                values={stat.values}
              />
            </div>

            {stat.delta && (
              <p className="m-0 mt-[12px] flex items-center gap-[8px] text-[12px] text-[#94a3b8]">
                <Delta value={stat.delta} />
                vs last 7 days
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Signal Trend Over Time (multi-line chart)                           */
/* ------------------------------------------------------------------ */

type TrendSeries = { label: string; color: string; values: number[] };

const dummyTrendLabels = ["May 21", "May 22", "May 23", "May 24", "May 25", "May 26", "May 27"];

const dummyTrendSeries: TrendSeries[] = [
  { label: "Total Signals", color: "#2563eb", values: [1050, 1300, 1300, 1560, 1280, 1540, 1450] },
  { label: "High-Intent Signals", color: "#7c3aed", values: [500, 560, 600, 640, 590, 680, 700] },
  { label: "Medium-Intent Signals", color: "#f97316", values: [270, 320, 340, 330, 320, 350, 360] },
  { label: "Low-Intent Signals", color: "#16a34a", values: [60, 70, 80, 75, 70, 85, 90] },
];

function niceStep(maxValue: number): number {
  const rough = maxValue / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough || 1));
  const normalized = rough / magnitude;
  const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return step * magnitude;
}

function formatTick(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K` : String(v);
}

function TrendChart({ labels, series }: { labels: string[]; series: TrendSeries[] }) {
  const w = 640;
  const h = 300;
  const left = 44;
  const right = w - 16;
  const top = 16;
  const bottom = 250;

  const maxSeriesValue = Math.max(1, ...series.flatMap((s) => s.values));
  const step = niceStep(maxSeriesValue);
  const yMax = step * 4;
  const gridValues = [0, step, step * 2, step * 3, step * 4].map((v) => ({ v, label: formatTick(v) }));

  const xOf = (i: number) => left + (labels.length > 1 ? (i * (right - left)) / (labels.length - 1) : 0);
  const yOf = (v: number) => bottom - (v / yMax) * (bottom - top);

  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h}`}>
      {gridValues.map((g) => (
        <g key={g.v}>
          <line
            stroke="#eef2f7"
            strokeWidth="1"
            x1={left}
            x2={right}
            y1={yOf(g.v)}
            y2={yOf(g.v)}
          />
          <text fill="#94a3b8" fontSize="11" textAnchor="end" x={left - 8} y={yOf(g.v) + 4}>
            {g.label}
          </text>
        </g>
      ))}

      {series.map((s) => {
        const points = s.values.map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ");

        return (
          <g key={s.label}>
            <polyline
              fill="none"
              points={points}
              stroke={s.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
            />
            {s.values.map((v, i) => (
              <circle cx={xOf(i)} cy={yOf(v)} fill={s.color} key={i} r="3.4" />
            ))}
          </g>
        );
      })}

      {labels.map((label, i) => (
        <text
          fill="#94a3b8"
          fontSize="11"
          key={label}
          textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
          x={xOf(i)}
          y={bottom + 28}
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

function SignalTrendCard({ labels, series }: { labels: string[]; series: TrendSeries[] }) {
  return (
    <section className="flex flex-col rounded-[18px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-[16px]">
        <div>
          <h2 className="m-0 text-[18px] font-bold text-[#0f172a]">
            Signal Trend Over Time
          </h2>
          <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">
            Volume of signals detected across all sources
          </p>
        </div>
        <button
          className="flex shrink-0 items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[12px] py-[7px] text-[13px] font-semibold text-[#475569]"
          type="button"
        >
          Last 7 Days
          <ChevronDown className="size-[14px] text-[#94a3b8]" />
        </button>
      </div>

      <div className="mt-[16px] flex flex-wrap items-center gap-x-[20px] gap-y-[8px]">
        {series.map((s) => (
          <span className="flex items-center gap-[8px]" key={s.label}>
            <span
              className="size-[10px] rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-[13px] font-medium text-[#475569]">{s.label}</span>
          </span>
        ))}
      </div>

      <div className="mt-[12px] flex-1">
        <TrendChart labels={labels} series={series} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Signals by Category (donut)                                         */
/* ------------------------------------------------------------------ */

type CategorySegment = { label: string; color: string; pct: string; count: string; value: number };

const dummySegments: CategorySegment[] = [
  { label: "News & Media", color: "#2563eb", pct: "38%", count: "1,082", value: 1082 },
  { label: "Social Signals", color: "#10b981", pct: "28%", count: "796", value: 796 },
  { label: "Web & Tech", color: "#f59e0b", pct: "16%", count: "455", value: 455 },
  { label: "Company Events", color: "#ef4444", pct: "12%", count: "340", value: 340 },
  { label: "Other Sources", color: "#94a3b8", pct: "6%", count: "173", value: 173 },
];

/* Real signal.source is always "zoominfo" - no meaningful source-type split
 * exists in the data, so this breaks down by the real signal_category field
 * (see CATEGORY_LABELS) instead of the dummy "News & Media" style buckets. */
function toCategorySegments(data: SignalStatsOut): CategorySegment[] {
  const total = data.by_category.reduce((sum, c) => sum + c.count, 0) || 1;
  return data.by_category.map((c, i) => ({
    label: CATEGORY_LABELS[c.signal_category] ?? c.signal_category.replace(/_/g, " "),
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    pct: `${Math.round((c.count / total) * 100)}%`,
    count: c.count.toLocaleString(),
    value: c.count,
  }));
}

function DonutChart({ segments }: { segments: CategorySegment[] }) {
  const size = 220;
  const thickness = 28;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  let offset = 0;

  return (
    <svg className="size-full" viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segments.map((s) => {
          const len = (s.value / total) * circumference;
          const dash = Math.max(len - 3, 0);
          const el = (
            <circle
              cx={size / 2}
              cy={size / 2}
              fill="none"
              key={s.label}
              r={radius}
              stroke={s.color}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              strokeWidth={thickness}
            />
          );
          offset += len;
          return el;
        })}
      </g>
    </svg>
  );
}

function SourceTypeCard({ segments, total }: { segments: CategorySegment[]; total: number }) {
  return (
    <section className="flex flex-col rounded-[18px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[18px] font-bold text-[#0f172a]">
        Signals by Category
      </h2>

      <div className="mt-[18px] flex flex-1 flex-col items-center gap-[24px] lg:flex-row lg:items-center">
        <div className="relative size-[200px] shrink-0">
          <DonutChart segments={segments} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[28px] font-bold leading-none text-[#0f172a]">
              {total.toLocaleString()}
            </span>
            <span className="mt-[4px] text-[13px] text-[#64748b]">Total</span>
          </div>
        </div>

        <div className="flex w-full flex-1 flex-col gap-[14px]">
          {segments.map((s) => (
            <div className="flex items-center justify-between gap-[12px]" key={s.label}>
              <span className="flex items-center gap-[10px]">
                <span
                  className="size-[10px] rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-[14px] font-medium text-[#334155]">
                  {s.label}
                </span>
              </span>
              <span className="whitespace-nowrap text-[14px] font-semibold text-[#0f172a]">
                {s.pct}{" "}
                <span className="font-normal text-[#94a3b8]">({s.count})</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <button
        className="mt-[20px] flex items-center gap-[8px] text-[14px] font-semibold text-[#4f46e5]"
        type="button"
      >
        View all category breakdown
        <ArrowRight className="size-[16px]" />
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Top High-Intent Signals (table)                                     */
/* ------------------------------------------------------------------ */

type Brand = {
  label: string;
  bg: string;
  color: string;
  icon?: IconType;
  text?: string;
};

function LogoSquare({ bg, color, icon: Icon, text }: Omit<Brand, "label">) {
  return (
    <span
      className="flex size-[28px] shrink-0 items-center justify-center rounded-[8px] text-[10px] font-bold"
      style={{ backgroundColor: bg, color }}
    >
      {Icon ? <Icon className="size-[16px]" /> : text}
    </span>
  );
}

function BrandCell({ brand }: { brand: Brand }) {
  return (
    <span className="flex min-w-0 items-center gap-[10px]">
      <LogoSquare bg={brand.bg} color={brand.color} icon={brand.icon} text={brand.text} />
      <span className="truncate text-[13px] font-medium text-[#334155]">
        {brand.label}
      </span>
    </span>
  );
}

const impactTones: Record<string, string> = {
  "Very High": "text-[#e11d48]",
  High: "text-[#f97316]",
  Medium: "text-[#d97706]",
  Low: "text-[#64748b]",
};

type SignalRow = {
  icon: IconType;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  account: Brand;
  source: Brand;
  score: number;
  detected: string;
  impact: string;
};

function titleCase(s: string): string {
  return s
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function impactFor(confidence: number): string {
  if (confidence >= 0.85) return "Very High";
  if (confidence >= 0.6) return "High";
  if (confidence >= 0.4) return "Medium";
  return "Low";
}

/* SignalWithCompanyOut has no logo/domain vocabulary - account/source
 * brand colors here are generic, decorative fallbacks. Real
 * title/company/score/impact/detected-at all come from the API. */
function toSignalRow(s: SignalWithCompanyOut): SignalRow {
  const confidence = s.signal_confidence ?? 0;
  const cat = categoryStyle(s.signal_category);
  return {
    icon: cat.icon,
    iconBg: cat.bg,
    iconColor: cat.color,
    title: titleCase(s.signal_type),
    subtitle: s.core_fact ? s.core_fact.slice(0, 60) : CATEGORY_LABELS[s.signal_category] ?? titleCase(s.signal_category),
    account: { label: s.company_name, bg: "#eef1ff", color: "#4f46e5", icon: Building2 },
    source: { label: titleCase(s.source ?? "ZoomInfo"), bg: "#f1f5f9", color: "#64748b", icon: Database },
    score: Math.round(confidence * 100),
    detected: relativeTime(s.ingested_at),
    impact: impactFor(confidence),
  };
}

const dummySignalRows: SignalRow[] = [
  {
    icon: CircleDollarSign,
    iconBg: "#f3e8ff",
    iconColor: "#7c3aed",
    title: "Funding Round Announced",
    subtitle: "Series B • $25M raised",
    account: { label: "Databricks", bg: "#fee2e2", color: "#ef4444", icon: Layers },
    source: { label: "TechCrunch", bg: "#dcfce7", color: "#16a34a", text: "TC" },
    score: 95,
    detected: "2 min ago",
    impact: "Very High",
  },
  {
    icon: UserPlus,
    iconBg: "#fce7f3",
    iconColor: "#db2777",
    title: "Hiring Spike Detected",
    subtitle: "12 new roles listed",
    account: { label: "Snowflake", bg: "#e0f2fe", color: "#0284c7", icon: Snowflake },
    source: { label: "LinkedIn", bg: "#e2edff", color: "#0a66c2", icon: Linkedin },
    score: 92,
    detected: "15 min ago",
    impact: "High",
  },
  {
    icon: Rocket,
    iconBg: "#fff1e8",
    iconColor: "#f97316",
    title: "Product Launch",
    subtitle: "Launched AI Copilot",
    account: { label: "HubSpot", bg: "#fff1e8", color: "#f97316", icon: Aperture },
    source: { label: "Company News", bg: "#f1f5f9", color: "#64748b", icon: Newspaper },
    score: 88,
    detected: "32 min ago",
    impact: "High",
  },
  {
    icon: Leaf,
    iconBg: "#dcfce7",
    iconColor: "#16a34a",
    title: "Technology Adoption",
    subtitle: "Using AWS Bedrock",
    account: { label: "MongoDB", bg: "#dcfce7", color: "#16a34a", icon: Database },
    source: { label: "BuiltWith", bg: "#f3e8ff", color: "#7c3aed", icon: Wrench },
    score: 85,
    detected: "1 hr ago",
    impact: "Medium",
  },
  {
    icon: Briefcase,
    iconBg: "#eef1ff",
    iconColor: "#4f46e5",
    title: "Executive Movement",
    subtitle: "New CRO joined",
    account: { label: "Salesforce", bg: "#e0f2fe", color: "#0ea5e9", icon: Cloud },
    source: { label: "LinkedIn", bg: "#e2edff", color: "#0a66c2", icon: Linkedin },
    score: 80,
    detected: "2 hr ago",
    impact: "Medium",
  },
];

const tableColumns =
  "grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_0.9fr_1fr_0.8fr]";

function TopHighIntentSignals({ rows }: { rows: SignalRow[] }) {
  return (
    <section className="rounded-[18px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-[16px]">
        <div>
          <h2 className="m-0 text-[18px] font-bold text-[#0f172a]">
            Top High-Intent Signals
          </h2>
          <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">
            Real-time high-priority signals ranked by score
          </p>
        </div>
        <button
          className="flex shrink-0 items-center gap-[8px] text-[13px] font-semibold text-[#4f46e5]"
          type="button"
        >
          View All Signals
          <ArrowRight className="size-[15px]" />
        </button>
      </div>

      <div className="mt-[18px] overflow-x-auto">
        <div className="min-w-[860px]">
          <div
            className={cn(
              "grid items-center gap-[16px] border-b border-[#eef1f6] pb-[12px] text-[11px] font-semibold uppercase tracking-[0.03em] text-[#94a3b8]",
              tableColumns,
            )}
          >
            <span>Signal</span>
            <span>Account</span>
            <span>Source</span>
            <span>Intent Score</span>
            <span>Detected At</span>
            <span>Impact</span>
          </div>

          <div className="divide-y divide-[#f1f5f9]">
            {rows.map((row, i) => {
              const Icon = row.icon;

              return (
                <div
                  className={cn("grid items-center gap-[16px] py-[14px]", tableColumns)}
                  key={`${row.title}-${i}`}
                >
                  <div className="flex min-w-0 items-center gap-[12px]">
                    <span
                      className="flex size-[36px] shrink-0 items-center justify-center rounded-[10px]"
                      style={{ backgroundColor: row.iconBg, color: row.iconColor }}
                    >
                      <Icon className="size-[19px]" />
                    </span>
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[14px] font-bold text-[#0f172a]">
                        {row.title}
                      </p>
                      <p className="m-0 truncate text-[12px] text-[#94a3b8]">
                        {row.subtitle}
                      </p>
                    </div>
                  </div>

                  <BrandCell brand={row.account} />
                  <BrandCell brand={row.source} />

                  <div>
                    <span className="inline-flex items-center justify-center rounded-[8px] bg-[#efeafe] px-[12px] py-[5px] text-[13px] font-bold text-[#6d28d9]">
                      {row.score}
                    </span>
                  </div>

                  <span className="text-[13px] text-[#64748b]">{row.detected}</span>

                  <span
                    className={cn("text-[13px] font-semibold", impactTones[row.impact])}
                  >
                    {row.impact}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <button
        className="mt-[16px] flex items-center gap-[8px] text-[14px] font-semibold text-[#4f46e5]"
        type="button"
      >
        View all high-intent signals
        <ArrowRight className="size-[16px]" />
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function SignalIntelligencePage() {
  const [statsData, setStatsData] = useState<SignalStatsOut | null>(null);

  useEffect(() => {
    const organisationId = getOrganisationId();
    if (!organisationId) {
      return;
    }
    getSignalStats(organisationId)
      .then((data) => {
        if (data.total > 0) {
          setStatsData(data);
        }
      })
      .catch(() => {
        // No backend/org yet - keep the dummy rows.
      });
  }, []);

  const statCards = statsData ? toStatCards(statsData) : dummyStats;
  const trendLabels = statsData && statsData.trend.length >= 2
    ? statsData.trend.map((p) => p.date)
    : dummyTrendLabels;
  const trendSeries: TrendSeries[] = statsData && statsData.trend.length >= 2
    ? [
        { label: "Total Signals", color: "#2563eb", values: statsData.trend.map((p) => p.total) },
        { label: "High-Intent Signals", color: "#7c3aed", values: statsData.trend.map((p) => p.high) },
        { label: "Medium-Intent Signals", color: "#f97316", values: statsData.trend.map((p) => p.medium) },
        { label: "Low-Intent Signals", color: "#16a34a", values: statsData.trend.map((p) => p.low) },
      ]
    : dummyTrendSeries;
  const categorySegments = statsData && statsData.by_category.length > 0 ? toCategorySegments(statsData) : dummySegments;
  const categoryTotal = statsData ? statsData.total : 2847;
  const topRows = statsData && statsData.top_signals.length > 0 ? statsData.top_signals.map(toSignalRow) : dummySignalRows;

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Signal Intelligence" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          detectionIcon={RefreshCw}
          searchPlaceholder="Search companies, triggers, executives..."
        />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[24px]">
          <div className="flex flex-col gap-[20px] xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-[12px]">
                <h1 className="m-0 text-[28px] font-bold text-[#0f172a]">
                  Signal Intelligence Engine
                </h1>
                <span className="flex items-center gap-[7px] rounded-full bg-[#eef1ff] px-[12px] py-[5px]">
                  <span className="size-[8px] rounded-full bg-[#16a34a]" />
                  <span className="text-[13px] font-semibold text-[#4f46e5]">Live</span>
                </span>
              </div>
              <p className="m-0 mt-[8px] text-[15px] text-[#64748b]">
                Identify, analyze, and prioritize high-intent signals in real-time.
              </p>
            </div>

            <button
              className="flex items-center gap-[10px] rounded-[12px] border border-[#e9edf5] bg-white px-[16px] py-[11px] text-[14px] font-semibold text-[#0f172a]"
              type="button"
            >
              <Calendar className="size-[17px] text-[#4f46e5]" />
              May 21 - May 27, 2024
              <ChevronDown className="size-[15px] text-[#94a3b8]" />
            </button>
          </div>

          <div className="mt-[22px]">
            <StatCards stats={statCards} />
          </div>

          <div className="mt-[22px] grid grid-cols-1 gap-[20px] xl:grid-cols-[1.6fr_1fr]">
            <SignalTrendCard labels={trendLabels} series={trendSeries} />
            <SourceTypeCard segments={categorySegments} total={categoryTotal} />
          </div>

          <div className="mt-[22px]">
            <TopHighIntentSignals rows={topRows} />
          </div>
        </main>
      </div>
    </div>
  );
}
