import {
  Activity,
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Gauge,
  Globe,
  Info,
  LineChart,
  PieChart,
  Target,
  Users,
  Zap,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";
import type { Data, ISOCode } from "react-svg-worldmap";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Delta, Donut, smoothPath } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";
import { getSignalStats, type SignalStatsOut } from "../../api/signals";
import { getOrganisationId } from "../../lib/session";
import { CATEGORY_COLORS, categoryLabel } from "../../lib/signalCategories";

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

type IconType = ComponentType<{ className?: string }>;

/* ------------------------------------------------------------------ */
/* Header + tabs                                                       */
/* ------------------------------------------------------------------ */

function AnalyticsHeader() {
  return (
    <div className="flex flex-col gap-[16px] xl:flex-row xl:items-start xl:justify-between">
      <div>
        <h1 className="m-0 text-[26px] font-bold text-[#0f172a]">Signal Analytics</h1>
        <p className="m-0 mt-[6px] text-[15px] text-[#64748b]">
          Analyze signal performance, trends, and impact to drive smarter decisions.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-[10px]">
        <button
          className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-semibold text-[#334155]"
          type="button"
        >
          <Download className="size-[16px] text-[#64748b]" />
          Export Report
          <ChevronDown className="size-[15px] text-[#94a3b8]" />
        </button>
        <button
          className="flex items-center gap-[10px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-semibold text-[#334155]"
          type="button"
        >
          <Calendar className="size-[16px] text-[#4f46e5]" />
          May 14 – May 20, 2025
          <ChevronDown className="size-[15px] text-[#94a3b8]" />
        </button>
        <button
          className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-semibold text-[#334155]"
          type="button"
        >
          <Filter className="size-[16px] text-[#64748b]" />
          Filters
        </button>
      </div>
    </div>
  );
}

const tabs = ["Overview"];

function AnalyticsTabs() {
  return (
    <div className="mt-[18px] flex gap-[28px] overflow-x-auto border-b border-[#e9edf5]">
      {tabs.map((tab, index) => {
        const active = index === 0;
        return (
          <button
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 pb-[14px] text-[14px] font-semibold transition",
              active
                ? "border-[#5b3df5] text-[#5b3df5]"
                : "border-transparent text-[#64748b] hover:text-[#334155]",
            )}
            key={tab}
            type="button"
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KPI cards                                                           */
/* ------------------------------------------------------------------ */

type Kpi = { icon: IconType; bg: string; color: string; label: string; value: string; delta: string | null };

const dummyKpis: Kpi[] = [
  { icon: Activity, bg: "#f3e9ff", color: "#7c3aed", label: "Total Signals", value: "12,847", delta: "18.6%" },
  { icon: Target, bg: "#e7f8ef", color: "#16a34a", label: "High Intent Signals", value: "3,247", delta: "22.3%" },
  { icon: Building2, bg: "#e6f0ff", color: "#2563eb", label: "Companies Impacted", value: "8,162", delta: "16.4%" },
  { icon: Users, bg: "#fff1e3", color: "#f97316", label: "Executives Impacted", value: "14,932", delta: "20.1%" },
  { icon: Gauge, bg: "#ffe9f0", color: "#e11d48", label: "Avg. Intent Score", value: "82", delta: "6 pts" },
  { icon: PieChart, bg: "#f3e9ff", color: "#7c3aed", label: "Actionable Rate", value: "94.2%", delta: "3.7 pts" },
];

/* No vs-previous-period baseline exists for a single org-wide snapshot, so
 * deltas are dropped rather than fabricated (same rule as the Signal
 * Intelligence dashboard and Trigger Library). "Precision Rate" had no
 * backend concept at all (no validation/ground-truth workflow) - replaced
 * with Actionable Rate (real is_action share), which does. */
function toKpis(data: SignalStatsOut): Kpi[] {
  const actionableRate = data.total > 0 ? Math.round((data.actionable_count / data.total) * 100) : 0;
  return [
    { icon: Activity, bg: "#f3e9ff", color: "#7c3aed", label: "Total Signals", value: data.total.toLocaleString(), delta: null },
    { icon: Target, bg: "#e7f8ef", color: "#16a34a", label: "High Intent Signals", value: data.high_intent.toLocaleString(), delta: null },
    { icon: Building2, bg: "#e6f0ff", color: "#2563eb", label: "Companies Impacted", value: data.company_count.toLocaleString(), delta: null },
    { icon: Users, bg: "#fff1e3", color: "#f97316", label: "Executives Impacted", value: data.executives_impacted.toLocaleString(), delta: null },
    { icon: Gauge, bg: "#ffe9f0", color: "#e11d48", label: "Avg. Intent Score", value: data.avg_confidence !== null ? String(Math.round(data.avg_confidence * 100)) : "—", delta: null },
    { icon: PieChart, bg: "#f3e9ff", color: "#7c3aed", label: "Actionable Rate", value: `${actionableRate}%`, delta: null },
  ];
}

function KpiCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-[16px] md:grid-cols-3 xl:grid-cols-6">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div
            className="rounded-[16px] border border-[#eef1f6] bg-white p-[16px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]"
            key={kpi.label}
          >
            <div className="flex items-center gap-[10px]">
              <span
                className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px]"
                style={{ backgroundColor: kpi.bg, color: kpi.color }}
              >
                <Icon className="size-[19px]" />
              </span>
              <span className="text-[13px] font-semibold text-[#475569]">
                {kpi.label}
              </span>
            </div>
            <p className="m-0 mt-[12px] text-[26px] font-bold leading-none text-[#0f172a]">
              {kpi.value}
            </p>
            {kpi.delta && (
              <p className="m-0 mt-[10px] flex flex-wrap items-center gap-[6px] text-[12px] text-[#94a3b8]">
                <Delta value={kpi.delta} />
                vs May 7 – May 13
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card chrome                                                         */
/* ------------------------------------------------------------------ */

function CardHead({
  title,
  action,
  info = true,
}: {
  title: string;
  action?: ReactNode;
  info?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-[12px]">
      <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">
        {title}
        {info && <Info className="size-[14px] text-[#cbd5e1]" />}
      </h2>
      {action}
    </div>
  );
}

function ViewLink({ label = "View Details" }: { label?: string }) {
  return (
    <button className="text-[13px] font-semibold text-[#5b3df5]" type="button">
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Signals Over Time (two-line chart)                                  */
/* ------------------------------------------------------------------ */

type TrendSeries = { label: string; color: string; values: number[] };

const dummyOverTimeLabels = ["May 14", "May 15", "May 16", "May 17", "May 18", "May 19", "May 20"];
const dummyOverTimeSeries: TrendSeries[] = [
  { label: "Total Signals", color: "#7c3aed", values: [1000, 1150, 1050, 1450, 1200, 1500, 1250] },
  { label: "High Intent Signals", color: "#16a34a", values: [420, 460, 440, 560, 500, 560, 500] },
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

function SignalsOverTimeChart({ labels, series }: { labels: string[]; series: TrendSeries[] }) {
  const w = 560;
  const h = 250;
  const left = 40;
  const right = w - 14;
  const top = 14;
  const bottom = 205;

  const maxSeriesValue = Math.max(1, ...series.flatMap((s) => s.values));
  const step = niceStep(maxSeriesValue);
  const yMax = step * 4;
  const grid = [0, step, step * 2, step * 3, step * 4].map((v) => ({ v, label: formatTick(v) }));

  const xOf = (i: number) => left + (labels.length > 1 ? (i * (right - left)) / (labels.length - 1) : 0);
  const yOf = (v: number) => bottom - (v / yMax) * (bottom - top);

  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h}`}>
      {grid.map((g) => (
        <g key={g.v}>
          <line stroke="#eef2f7" strokeWidth="1" x1={left} x2={right} y1={yOf(g.v)} y2={yOf(g.v)} />
          <text fill="#94a3b8" fontSize="11" textAnchor="end" x={left - 8} y={yOf(g.v) + 4}>
            {g.label}
          </text>
        </g>
      ))}

      {series.map((s) => {
        const pts = s.values.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
        return (
          <g key={s.label}>
            <path d={smoothPath(pts)} fill="none" stroke={s.color} strokeLinecap="round" strokeWidth="2.5" />
            {pts.map((p, i) => (
              <circle cx={p.x} cy={p.y} fill={s.color} key={i} r="3.6" />
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
          y={bottom + 26}
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

function SignalsOverTimeCard({ labels, series }: { labels: string[]; series: TrendSeries[] }) {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <CardHead
        action={
          <button
            className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[12px] py-[7px] text-[13px] font-semibold text-[#475569]"
            type="button"
          >
            Daily
            <ChevronDown className="size-[14px] text-[#94a3b8]" />
          </button>
        }
        title="Signals Over Time"
      />
      <div className="mt-[14px] flex items-center gap-[20px]">
        {series.map((s) => (
          <span className="flex items-center gap-[8px]" key={s.label}>
            <span className="size-[10px] rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[12px] font-medium text-[#475569]">{s.label}</span>
          </span>
        ))}
      </div>
      <div className="mt-[10px]">
        <SignalsOverTimeChart labels={labels} series={series} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Signals by Category (donut)                                         */
/* ------------------------------------------------------------------ */

type CategorySegment = { label: string; value: number; pct: string; color: string };

const dummyCategorySegments: CategorySegment[] = [
  { label: "Funding & Investment", value: 2913, pct: "22.7%", color: "#7c3aed" },
  { label: "Product & Innovation", value: 2465, pct: "19.2%", color: "#f97316" },
  { label: "Hiring & Talent", value: 2102, pct: "16.4%", color: "#2563eb" },
  { label: "Company Expansion", value: 1876, pct: "14.6%", color: "#16a34a" },
  { label: "Partnership & Alliances", value: 1245, pct: "9.7%", color: "#be123c" },
  { label: "Financial Performance", value: 854, pct: "6.6%", color: "#0891b2" },
  { label: "Other Events", value: 1392, pct: "10.8%", color: "#cbd5e1" },
];

function toCategorySegments(data: SignalStatsOut): CategorySegment[] {
  const total = data.by_category.reduce((sum, c) => sum + c.count, 0) || 1;
  return data.by_category.map((c, i) => ({
    label: categoryLabel(c.signal_category),
    value: c.count,
    pct: `${((c.count / total) * 100).toFixed(1)}%`,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));
}

function CategoryCard({ segments, total }: { segments: CategorySegment[]; total: number }) {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <CardHead action={<ViewLink />} title="Signals by Category" />
      <div className="mt-[16px] flex flex-col items-center gap-[16px] sm:flex-row">
        <div className="relative size-[148px] shrink-0">
          <Donut
            segments={segments.map((s) => ({ value: s.value, color: s.color }))}
            size={148}
            thickness={22}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[18px] font-bold leading-none text-[#0f172a]">{total.toLocaleString()}</span>
            <span className="mt-[3px] text-[11px] text-[#64748b]">Total</span>
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-1 flex-col gap-[9px]">
          {segments.map((s) => (
            <div className="flex items-center justify-between gap-[8px]" key={s.label}>
              <span className="flex min-w-0 items-center gap-[8px]">
                <span className="size-[9px] shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="truncate text-[11px] font-medium text-[#334155]">{s.label}</span>
              </span>
              <span className="whitespace-nowrap text-[11px] text-[#94a3b8]">
                <span className="font-semibold text-[#0f172a]">{s.value.toLocaleString()}</span>{" "}
                ({s.pct})
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Intent Score Distribution (bar chart)                               */
/* ------------------------------------------------------------------ */

type HistogramBar = { label: string; value: number };

const dummyDistributionBars: HistogramBar[] = [
  { label: "0-20", value: 312 },
  { label: "20-40", value: 968 },
  { label: "40-60", value: 2410 },
  { label: "60-80", value: 3625 },
  { label: "80-100", value: 5532 },
];

function toDistributionBars(data: SignalStatsOut): HistogramBar[] {
  return data.histogram.map((b) => ({ label: b.bucket, value: b.count }));
}

function DistributionChart({ bars }: { bars: HistogramBar[] }) {
  const w = 560;
  const h = 270;
  const left = 42;
  const right = w - 16;
  const top = 20;
  const bottom = 220;

  const maxValue = Math.max(1, ...bars.map((b) => b.value));
  const step = niceStep(maxValue);
  const yMax = step * 4;
  const grid = [0, step, step * 2, step * 3, step * 4];
  const yOf = (v: number) => bottom - (v / yMax) * (bottom - top);
  const band = (right - left) / bars.length;
  const barW = 46;

  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="bar-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
      </defs>

      {grid.map((v) => (
        <g key={v}>
          <line stroke="#eef2f7" strokeWidth="1" x1={left} x2={right} y1={yOf(v)} y2={yOf(v)} />
          <text fill="#94a3b8" fontSize="11" textAnchor="end" x={left - 8} y={yOf(v) + 4}>
            {formatTick(v)}
          </text>
        </g>
      ))}

      {bars.map((bar, i) => {
        const cx = left + band * i + band / 2;
        const y = yOf(bar.value);
        return (
          <g key={bar.label}>
            <rect
              fill="url(#bar-grad)"
              height={Math.max(bottom - y, 0)}
              rx="6"
              width={barW}
              x={cx - barW / 2}
              y={y}
            />
            <text fill="#0f172a" fontSize="12" fontWeight="700" textAnchor="middle" x={cx} y={y - 8}>
              {bar.value.toLocaleString()}
            </text>
            <text fill="#94a3b8" fontSize="11" textAnchor="middle" x={cx} y={bottom + 22}>
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DistributionCard({ bars }: { bars: HistogramBar[] }) {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <CardHead action={<ViewLink />} title="Intent Score Distribution" />
      <div className="mt-[14px]">
        <DistributionChart bars={bars} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Top Signal Sources (table)                                          */
/* ------------------------------------------------------------------ */

type SourceRow = { logo: string; bg: string; color: string; name: string; signals: number; pct: string };

const dummySources: SourceRow[] = [
  { logo: "TC", bg: "#dcfce7", color: "#16a34a", name: "TechCrunch", signals: 1847, pct: "14.4%" },
  { logo: "PR", bg: "#fff1e3", color: "#f97316", name: "PR Newswire", signals: 1523, pct: "11.9%" },
  { logo: "bw", bg: "#e6f0ff", color: "#2563eb", name: "Business Wire", signals: 1287, pct: "10.0%" },
  { logo: "in", bg: "#e2edff", color: "#0a66c2", name: "LinkedIn", signals: 1125, pct: "8.8%" },
  { logo: "cc", bg: "#e6f9fb", color: "#0891b2", name: "Crunchbase", signals: 986, pct: "7.7%" },
];

const SOURCE_ROW_COLORS = [
  { bg: "#dcfce7", color: "#16a34a" },
  { bg: "#fff1e3", color: "#f97316" },
  { bg: "#e6f0ff", color: "#2563eb" },
  { bg: "#e2edff", color: "#0a66c2" },
  { bg: "#e6f9fb", color: "#0891b2" },
];

/* Real signal.source is always "zoominfo" - no per-article publisher is
 * stored directly, but original_source embeds the article URL for
 * news-derived signals (see signal_directory.top_sources), so this groups
 * by the real parsed hostname instead of fabricating outlet names. The
 * fake "High Intent %"/"Trend" columns are dropped - nothing backs a
 * per-source confidence or trend breakdown without a lot more backend work. */
function toSources(data: SignalStatsOut): SourceRow[] {
  const total = data.by_source.reduce((sum, s) => sum + s.count, 0) || 1;
  return data.by_source.map((s, i) => {
    const colors = SOURCE_ROW_COLORS[i % SOURCE_ROW_COLORS.length];
    return {
      logo: s.source.slice(0, 2).toUpperCase(),
      bg: colors.bg,
      color: colors.color,
      name: s.source,
      signals: s.count,
      pct: `${((s.count / total) * 100).toFixed(1)}%`,
    };
  });
}

const sourceColumns = "grid-cols-[minmax(0,1.8fr)_0.9fr_0.9fr]";

function TopSourcesCard({ sources, total }: { sources: SourceRow[]; total: number }) {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <CardHead action={<ViewLink label="View All" />} info={false} title="Top Signal Sources" />

      <div className="mt-[14px] overflow-x-auto">
        <div className="min-w-[380px]">
          <div
            className={cn(
              "grid items-center gap-[12px] border-b border-[#eef1f6] pb-[10px] text-[12px] font-medium text-[#94a3b8]",
              sourceColumns,
            )}
          >
            <span>Source</span>
            <span>Signals</span>
            <span>% of Total</span>
          </div>

          <div className="divide-y divide-[#f1f5f9]">
            {sources.map((s) => (
              <div
                className={cn("grid items-center gap-[12px] py-[11px] text-[13px]", sourceColumns)}
                key={s.name}
              >
                <span className="flex min-w-0 items-center gap-[10px]">
                  <span
                    className="flex size-[28px] shrink-0 items-center justify-center rounded-[7px] text-[10px] font-bold uppercase"
                    style={{ backgroundColor: s.bg, color: s.color }}
                  >
                    {s.logo}
                  </span>
                  <span className="truncate font-semibold text-[#0f172a]">{s.name}</span>
                </span>
                <span className="font-semibold text-[#0f172a]">{s.signals.toLocaleString()}</span>
                <span className="text-[#64748b]">{s.pct}</span>
              </div>
            ))}

            <div className={cn("grid items-center gap-[12px] pt-[12px] text-[13px] font-bold text-[#0f172a]", sourceColumns)}>
              <span>Total</span>
              <span>{total.toLocaleString()}</span>
              <span />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Signals by Intent Level (donut)                                     */
/* ------------------------------------------------------------------ */

type IntentSegment = { label: string; value: number; pct: string; color: string };

const dummyIntentSegments: IntentSegment[] = [
  { label: "High (80-100)", value: 3247, pct: "25.3%", color: "#7c3aed" },
  { label: "Medium (50-79)", value: 6138, pct: "47.7%", color: "#f97316" },
  { label: "Low (20-49)", value: 2832, pct: "22.0%", color: "#2563eb" },
  { label: "Very Low (0-19)", value: 630, pct: "4.9%", color: "#cbd5e1" },
];

/* Real tiers use the same 0.60/0.40 confidence thresholds as everywhere
 * else on the Signal Intelligence pages - 3 tiers, not 4, since the
 * backend doesn't distinguish a separate "Very Low" bucket. */
function toIntentSegments(data: SignalStatsOut): IntentSegment[] {
  const total = data.total || 1;
  return [
    { label: "High Intent", value: data.high_intent, pct: `${((data.high_intent / total) * 100).toFixed(1)}%`, color: "#7c3aed" },
    { label: "Medium Intent", value: data.medium_intent, pct: `${((data.medium_intent / total) * 100).toFixed(1)}%`, color: "#f97316" },
    { label: "Low Intent", value: data.low_intent, pct: `${((data.low_intent / total) * 100).toFixed(1)}%`, color: "#2563eb" },
  ];
}

function IntentLevelCard({ segments, total }: { segments: IntentSegment[]; total: number }) {
  const highMediumPct = total > 0 ? (((segments[0]?.value ?? 0) + (segments[1]?.value ?? 0)) / total) * 100 : 0;

  return (
    <section className="flex flex-col rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <CardHead action={<ViewLink />} title="Signals by Intent Level" />
      <div className="mt-[16px] flex flex-1 flex-col items-center gap-[20px] sm:flex-row">
        <div className="relative size-[160px] shrink-0">
          <Donut
            segments={segments.map((s) => ({ value: s.value, color: s.color }))}
            size={160}
            thickness={24}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[19px] font-bold leading-none text-[#0f172a]">{total.toLocaleString()}</span>
            <span className="mt-[3px] text-[12px] text-[#64748b]">Total</span>
          </div>
        </div>
        <div className="flex w-full flex-1 flex-col gap-[12px]">
          {segments.map((s) => (
            <div className="flex items-center justify-between gap-[10px]" key={s.label}>
              <span className="flex items-center gap-[8px]">
                <span className="size-[9px] rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-[12px] font-medium text-[#334155]">{s.label}</span>
              </span>
              <span className="whitespace-nowrap text-[12px] text-[#94a3b8]">
                <span className="font-semibold text-[#0f172a]">{s.value.toLocaleString()}</span>{" "}
                ({s.pct})
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-[16px] border-t border-[#f1f5f9] pt-[14px] text-center text-[13px] font-semibold text-[#16a34a]">
        High &amp; Medium Intent {highMediumPct.toFixed(1)}%
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Geographic Distribution                                             */
/* ------------------------------------------------------------------ */

type CountryRow = { name: string; value: number; pct: string };

const dummyCountries: CountryRow[] = [
  { name: "United States", value: 4267, pct: "33.2%" },
  { name: "India", value: 1842, pct: "14.3%" },
  { name: "United Kingdom", value: 982, pct: "7.6%" },
  { name: "Canada", value: 671, pct: "5.2%" },
  { name: "Germany", value: 612, pct: "4.8%" },
];

/* Common ZoomInfo firmographic country names -> ISO alpha-2, for shading
 * the world map. Not exhaustive - unmapped countries just don't shade
 * rather than crashing, which is fine since the real data is US-heavy. */
/* react-svg-worldmap's ISOCode union omits a few small territories (no
 * Singapore, no Hong Kong) - those country names just won't shade on the
 * map, though they still show up in the real "Top Countries" list below. */
const COUNTRY_ISO: Record<string, ISOCode> = {
  "united states": "us", canada: "ca", india: "in", "united kingdom": "gb",
  germany: "de", australia: "au", france: "fr", russia: "ru", ireland: "ie",
  denmark: "dk", finland: "fi", belgium: "be", israel: "il",
  netherlands: "nl", spain: "es", italy: "it", sweden: "se", norway: "no",
  switzerland: "ch", japan: "jp", china: "cn", brazil: "br", mexico: "mx",
  "south korea": "kr", "new zealand": "nz", "south africa": "za", poland: "pl",
  austria: "at", portugal: "pt", "united arab emirates": "ae", "saudi arabia": "sa",
  philippines: "ph", indonesia: "id", malaysia: "my", thailand: "th",
  vietnam: "vn", taiwan: "tw", argentina: "ar", chile: "cl", colombia: "co",
};

function toCountries(data: SignalStatsOut): CountryRow[] {
  const total = data.total || 1;
  return data.by_country.map((c) => ({
    name: c.country,
    value: c.count,
    pct: `${((c.count / total) * 100).toFixed(1)}%`,
  }));
}

function toGeoData(countries: CountryRow[]): Data {
  return countries
    .map((c) => ({ country: COUNTRY_ISO[c.name.toLowerCase()], value: c.value }))
    .filter((c): c is { country: ISOCode; value: number } => Boolean(c.country));
}

/* Real world map, shaded by real signal volume per company country (see
 * signal_directory.counts_by_country). Lazy-loaded so the ~170KB map
 * geometry stays out of the main bundle (same rationale as the dashboard
 * globe). */
const LazyWorldMap = lazy(() =>
  import("react-svg-worldmap").then((m) => ({ default: m.WorldMap })),
);

function WorldMap({ geoData }: { geoData: Data }) {
  return (
    <Suspense
      fallback={<div className="size-full animate-pulse rounded-[12px] bg-[#efe9ff]" />}
    >
      <div className="[&_figure]:!m-0 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full">
        <LazyWorldMap
          backgroundColor="transparent"
          color="#7c3aed"
          data={geoData}
          size="responsive"
          strokeOpacity={0.7}
          styleFunction={({ countryValue }) => ({
            fill: countryValue === undefined ? "#ded5fb" : "#7c3aed",
            stroke: "#ffffff",
            strokeWidth: 0.4,
            cursor: "default",
          })}
        />
      </div>
    </Suspense>
  );
}

function GeographicCard({ countries, geoData }: { countries: CountryRow[]; geoData: Data }) {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <CardHead action={<ViewLink />} title="Geographic Distribution" />
      <div className="mt-[16px] flex flex-col gap-[16px]">
        <div className="w-full overflow-hidden rounded-[12px] bg-[#f7f5ff] px-[10px] py-[8px]">
          <WorldMap geoData={geoData} />
        </div>
        <div className="flex items-center gap-[10px]">
          <span className="text-[12px] text-[#94a3b8]">Low</span>
          <span className="h-[8px] flex-1 rounded-full bg-gradient-to-r from-[#ede9fe] to-[#6d28d9]" />
          <span className="text-[12px] text-[#94a3b8]">High</span>
        </div>
        <div>
          <p className="m-0 text-[13px] font-semibold text-[#475569]">Top Countries</p>
          <div className="mt-[12px] grid grid-cols-1 gap-x-[20px] gap-y-[10px] sm:grid-cols-2">
            {countries.slice(0, 5).map((c) => (
              <div className="flex items-center justify-between gap-[10px]" key={c.name}>
                <span className="text-[13px] text-[#334155]">{c.name}</span>
                <span className="whitespace-nowrap text-[13px] text-[#94a3b8]">
                  <span className="font-semibold text-[#0f172a]">{c.value.toLocaleString()}</span> ({c.pct})
                </span>
              </div>
            ))}
          </div>
          <button
            className="mt-[16px] w-full rounded-[10px] border border-[#e9edf5] bg-white py-[9px] text-[13px] font-semibold text-[#5b3df5]"
            type="button"
          >
            View All
          </button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Key Insights                                                        */
/* ------------------------------------------------------------------ */

type Insight = { icon: IconType; bg: string; color: string; text: ReactNode };

const dummyInsights: Insight[] = [
  {
    icon: LineChart,
    bg: "#e7f8ef",
    color: "#16a34a",
    text: (
      <>
        <b className="font-semibold text-[#0f172a]">High intent signals</b> increased 22.3%
        compared to the previous 7 days.
      </>
    ),
  },
  {
    icon: Target,
    bg: "#fff1e3",
    color: "#f97316",
    text: (
      <>
        <b className="font-semibold text-[#0f172a]">Funding & Investment</b> is the top category
        with 22.7% share.
      </>
    ),
  },
  {
    icon: Users,
    bg: "#e6f0ff",
    color: "#2563eb",
    text: (
      <>
        <b className="font-semibold text-[#0f172a]">TechCrunch and PR Newswire</b> are the leading
        sources by volume.
      </>
    ),
  },
  {
    icon: Zap,
    bg: "#f3e9ff",
    color: "#7c3aed",
    text: (
      <>
        <b className="font-semibold text-[#0f172a]">94.2%</b> of signals have an intent score of
        80 or higher.
      </>
    ),
  },
  {
    icon: Globe,
    bg: "#ffe9f0",
    color: "#e11d48",
    text: (
      <>
        <b className="font-semibold text-[#0f172a]">United States</b> accounts for 33.2% of total
        signals.
      </>
    ),
  },
];

/* Regenerated from the same real aggregates driving the cards above,
 * instead of fixed prose naming categories/sources/countries that may not
 * even be the real top ones for this org. */
function buildInsights(
  data: SignalStatsOut,
  categories: CategorySegment[],
  sources: SourceRow[],
  countries: CountryRow[],
): Insight[] {
  const topCategory = categories[0];
  const topSources = sources.slice(0, 2).map((s) => s.name);
  const topCountry = countries[0];
  const highMediumPct = data.total > 0 ? (((data.high_intent + data.medium_intent) / data.total) * 100).toFixed(1) : "0";
  const actionableRate = data.total > 0 ? Math.round((data.actionable_count / data.total) * 100) : 0;

  const insights: Insight[] = [];

  insights.push({
    icon: LineChart,
    bg: "#e7f8ef",
    color: "#16a34a",
    text: (
      <>
        <b className="font-semibold text-[#0f172a]">{highMediumPct}%</b> of signals are High or
        Medium intent.
      </>
    ),
  });

  if (topCategory) {
    insights.push({
      icon: Target,
      bg: "#fff1e3",
      color: "#f97316",
      text: (
        <>
          <b className="font-semibold text-[#0f172a]">{topCategory.label}</b> is the top category
          with {topCategory.pct} share.
        </>
      ),
    });
  }

  if (topSources.length > 0) {
    insights.push({
      icon: Users,
      bg: "#e6f0ff",
      color: "#2563eb",
      text: (
        <>
          <b className="font-semibold text-[#0f172a]">{topSources.join(" and ")}</b> {topSources.length > 1 ? "are" : "is"} the
          leading source{topSources.length > 1 ? "s" : ""} by volume.
        </>
      ),
    });
  }

  insights.push({
    icon: Zap,
    bg: "#f3e9ff",
    color: "#7c3aed",
    text: (
      <>
        <b className="font-semibold text-[#0f172a]">{actionableRate}%</b> of signals reflect a
        direct, actionable event.
      </>
    ),
  });

  if (topCountry) {
    insights.push({
      icon: Globe,
      bg: "#ffe9f0",
      color: "#e11d48",
      text: (
        <>
          <b className="font-semibold text-[#0f172a]">{topCountry.name}</b> accounts for {topCountry.pct} of
          total signals.
        </>
      ),
    });
  }

  return insights;
}

function KeyInsights({ insights }: { insights: Insight[] }) {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">
        Key Insights
        <Info className="size-[14px] text-[#cbd5e1]" />
      </h2>
      <div className="mt-[16px] grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-5">
        {insights.map((insight, i) => {
          const Icon = insight.icon;
          return (
            <div className="flex gap-[12px] rounded-[12px] bg-[#f8fafc] p-[14px]" key={i}>
              <span
                className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px]"
                style={{ backgroundColor: insight.bg, color: insight.color }}
              >
                <Icon className="size-[17px]" />
              </span>
              <p className="m-0 text-[13px] leading-[19px] text-[#64748b]">{insight.text}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer pagination                                                   */
/* ------------------------------------------------------------------ */

function PageButton({
  children,
  active = false,
  ariaLabel,
}: {
  children: ReactNode;
  active?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "flex size-[34px] items-center justify-center rounded-[9px] text-[13px] font-semibold transition",
        active
          ? "bg-[#5b3df5] text-white"
          : "border border-[#e9edf5] bg-white text-[#475569] hover:bg-[#f6f7fb]",
      )}
      type="button"
    >
      {children}
    </button>
  );
}

function FooterBar({ total }: { total: number }) {
  return (
    <div className="flex flex-col items-center gap-[16px] lg:flex-row lg:justify-between">
      <span className="text-[13px] text-[#64748b]">Showing 1 to {Math.min(10, total)} of {total.toLocaleString()} signals</span>
      <div className="flex items-center gap-[6px]">
        <PageButton ariaLabel="Previous page">
          <ChevronLeft className="size-[16px]" />
        </PageButton>
        <PageButton active>1</PageButton>
        <PageButton>2</PageButton>
        <PageButton>3</PageButton>
        <PageButton>4</PageButton>
        <PageButton>5</PageButton>
        <span className="px-[4px] text-[14px] text-[#94a3b8]">…</span>
        <PageButton>100</PageButton>
        <PageButton ariaLabel="Next page">
          <ChevronRight className="size-[16px]" />
        </PageButton>
      </div>
      <button
        className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[8px] text-[13px] font-semibold text-[#334155]"
        type="button"
      >
        10 / page
        <ChevronDown className="size-[14px] text-[#94a3b8]" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function SignalAnalyticsPage() {
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
        // No backend/org yet - keep the dummy fallback data.
      });
  }, []);

  const kpis = statsData ? toKpis(statsData) : dummyKpis;

  const overTimeLabels = statsData && statsData.trend.length >= 2 ? statsData.trend.map((p) => p.date) : dummyOverTimeLabels;
  const overTimeSeries: TrendSeries[] =
    statsData && statsData.trend.length >= 2
      ? [
          { label: "Total Signals", color: "#7c3aed", values: statsData.trend.map((p) => p.total) },
          { label: "High Intent Signals", color: "#16a34a", values: statsData.trend.map((p) => p.high) },
        ]
      : dummyOverTimeSeries;

  const categorySegments = statsData && statsData.by_category.length > 0 ? toCategorySegments(statsData) : dummyCategorySegments;
  const categoryTotal = statsData ? statsData.total : 12847;

  const distributionBars = statsData ? toDistributionBars(statsData) : dummyDistributionBars;

  const sources = statsData && statsData.by_source.length > 0 ? toSources(statsData) : dummySources;
  const sourceTotal = sources.reduce((sum, s) => sum + s.signals, 0);

  const intentSegments = statsData ? toIntentSegments(statsData) : dummyIntentSegments;
  const intentTotal = statsData ? statsData.total : 12847;

  const countries = statsData && statsData.by_country.length > 0 ? toCountries(statsData) : dummyCountries;
  const geoData = toGeoData(countries);

  const insights = statsData ? buildInsights(statsData, categorySegments, sources, countries) : dummyInsights;

  const footerTotal = statsData ? statsData.total : 12847;

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Signal Intelligence" activeSub="Signal Analytics" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          searchPlaceholder="Search companies, triggers, executives..."
          showDetection={false}
        />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          <AnalyticsHeader />
          <AnalyticsTabs />

          <div className="mt-[22px]">
            <KpiCards kpis={kpis} />
          </div>

          <div className="mt-[20px] grid grid-cols-1 gap-[20px] xl:grid-cols-3">
            <SignalsOverTimeCard labels={overTimeLabels} series={overTimeSeries} />
            <CategoryCard segments={categorySegments} total={categoryTotal} />
            <DistributionCard bars={distributionBars} />
          </div>

          <div className="mt-[20px] grid grid-cols-1 gap-[20px] xl:grid-cols-3">
            <TopSourcesCard sources={sources} total={sourceTotal} />
            <IntentLevelCard segments={intentSegments} total={intentTotal} />
            <GeographicCard countries={countries} geoData={geoData} />
          </div>

          <div className="mt-[20px]">
            <KeyInsights insights={insights} />
          </div>

          <div className="mt-[24px]">
            <FooterBar total={footerTotal} />
          </div>
        </main>
      </div>
    </div>
  );
}
