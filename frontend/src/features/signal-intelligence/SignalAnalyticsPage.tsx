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
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Delta, Donut, Sparkline, smoothPath } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";

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

const tabs = [
  "Overview",
  "Trend Analysis",
  "Category Performance",
  "Source Analysis",
  "Intent Analysis",
  "Signal Quality",
  "Impact Analysis",
  "Benchmarking",
];

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

const kpis = [
  { icon: Activity, bg: "#f3e9ff", color: "#7c3aed", label: "Total Signals", value: "12,847", delta: "18.6%" },
  { icon: Target, bg: "#e7f8ef", color: "#16a34a", label: "High Intent Signals", value: "3,247", delta: "22.3%" },
  { icon: Building2, bg: "#e6f0ff", color: "#2563eb", label: "Companies Impacted", value: "8,162", delta: "16.4%" },
  { icon: Users, bg: "#fff1e3", color: "#f97316", label: "Executives Impacted", value: "14,932", delta: "20.1%" },
  { icon: Gauge, bg: "#ffe9f0", color: "#e11d48", label: "Avg. Intent Score", value: "82", delta: "6 pts" },
  { icon: PieChart, bg: "#f3e9ff", color: "#7c3aed", label: "Precision Rate", value: "94.2%", delta: "3.7 pts" },
];

function KpiCards() {
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
            <p className="m-0 mt-[10px] flex flex-wrap items-center gap-[6px] text-[12px] text-[#94a3b8]">
              <Delta value={kpi.delta} />
              vs May 7 – May 13
            </p>
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

const overTimeLabels = ["May 14", "May 15", "May 16", "May 17", "May 18", "May 19", "May 20"];
const overTimeSeries = [
  { label: "Total Signals", color: "#7c3aed", values: [1000, 1150, 1050, 1450, 1200, 1500, 1250] },
  { label: "High Intent Signals", color: "#16a34a", values: [420, 460, 440, 560, 500, 560, 500] },
];

function SignalsOverTimeChart() {
  const w = 560;
  const h = 250;
  const left = 40;
  const right = w - 14;
  const top = 14;
  const bottom = 205;
  const yMax = 2000;
  const grid = [
    { v: 0, label: "0" },
    { v: 500, label: "500" },
    { v: 1000, label: "1K" },
    { v: 1500, label: "1.5K" },
    { v: 2000, label: "2K" },
  ];
  const xOf = (i: number) => left + (i * (right - left)) / (overTimeLabels.length - 1);
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

      {overTimeSeries.map((s) => {
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

      {overTimeLabels.map((label, i) => (
        <text
          fill="#94a3b8"
          fontSize="11"
          key={label}
          textAnchor={i === 0 ? "start" : i === overTimeLabels.length - 1 ? "end" : "middle"}
          x={xOf(i)}
          y={bottom + 26}
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

function SignalsOverTimeCard() {
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
        {overTimeSeries.map((s) => (
          <span className="flex items-center gap-[8px]" key={s.label}>
            <span className="size-[10px] rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[12px] font-medium text-[#475569]">{s.label}</span>
          </span>
        ))}
      </div>
      <div className="mt-[10px]">
        <SignalsOverTimeChart />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Signals by Category (donut)                                         */
/* ------------------------------------------------------------------ */

const categorySegments = [
  { label: "Funding & Investment", value: 2913, pct: "22.7%", color: "#7c3aed" },
  { label: "Product & Innovation", value: 2465, pct: "19.2%", color: "#f97316" },
  { label: "Hiring & Talent", value: 2102, pct: "16.4%", color: "#2563eb" },
  { label: "Company Expansion", value: 1876, pct: "14.6%", color: "#16a34a" },
  { label: "Partnership & Alliances", value: 1245, pct: "9.7%", color: "#be123c" },
  { label: "Financial Performance", value: 854, pct: "6.6%", color: "#0891b2" },
  { label: "Other Events", value: 1392, pct: "10.8%", color: "#cbd5e1" },
];

function CategoryCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <CardHead action={<ViewLink />} title="Signals by Category" />
      <div className="mt-[16px] flex flex-col items-center gap-[16px] sm:flex-row">
        <div className="relative size-[148px] shrink-0">
          <Donut
            segments={categorySegments.map((s) => ({ value: s.value, color: s.color }))}
            size={148}
            thickness={22}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[18px] font-bold leading-none text-[#0f172a]">12,847</span>
            <span className="mt-[3px] text-[11px] text-[#64748b]">Total</span>
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-1 flex-col gap-[9px]">
          {categorySegments.map((s) => (
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

const distributionBars = [
  { label: "0-20", value: 312 },
  { label: "20-40", value: 968 },
  { label: "40-60", value: 2410 },
  { label: "60-80", value: 3625 },
  { label: "80-100", value: 5532 },
];

function DistributionChart() {
  const w = 560;
  const h = 270;
  const left = 42;
  const right = w - 16;
  const top = 20;
  const bottom = 220;
  const yMax = 6000;
  const grid = [0, 1000, 2000, 3000, 4000, 5000, 6000];
  const fmt = (v: number) => (v === 0 ? "0" : `${v / 1000}K`);
  const yOf = (v: number) => bottom - (v / yMax) * (bottom - top);
  const band = (right - left) / distributionBars.length;
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
            {fmt(v)}
          </text>
        </g>
      ))}

      {distributionBars.map((bar, i) => {
        const cx = left + band * i + band / 2;
        const y = yOf(bar.value);
        return (
          <g key={bar.label}>
            <rect
              fill="url(#bar-grad)"
              height={bottom - y}
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

function DistributionCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <CardHead action={<ViewLink />} title="Intent Score Distribution" />
      <div className="mt-[14px]">
        <DistributionChart />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Top Signal Sources (table)                                          */
/* ------------------------------------------------------------------ */

const sources = [
  { logo: "TC", bg: "#dcfce7", color: "#16a34a", name: "TechCrunch", signals: "1,847", pct: "14.4%", high: "28.6%", trend: "23.1%", spark: [20, 26, 24, 32, 30, 38, 42] },
  { logo: "PR", bg: "#fff1e3", color: "#f97316", name: "PR Newswire", signals: "1,523", pct: "11.9%", high: "24.3%", trend: "15.3%", spark: [22, 24, 28, 26, 32, 30, 36] },
  { logo: "bw", bg: "#e6f0ff", color: "#2563eb", name: "Business Wire", signals: "1,287", pct: "10.0%", high: "22.1%", trend: "18.7%", spark: [18, 22, 20, 28, 26, 32, 34] },
  { logo: "in", bg: "#e2edff", color: "#0a66c2", name: "LinkedIn", signals: "1,125", pct: "8.8%", high: "26.4%", trend: "21.9%", spark: [24, 22, 30, 28, 34, 32, 40] },
  { logo: "cc", bg: "#e6f9fb", color: "#0891b2", name: "Crunchbase", signals: "986", pct: "7.7%", high: "20.3%", trend: "12.5%", spark: [20, 24, 22, 26, 28, 27, 31] },
];

const sourceColumns = "grid-cols-[minmax(0,1.5fr)_0.8fr_0.8fr_1fr_1fr]";

function TopSourcesCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <CardHead action={<ViewLink label="View All" />} info={false} title="Top Signal Sources" />

      <div className="mt-[14px] overflow-x-auto">
        <div className="min-w-[460px]">
          <div
            className={cn(
              "grid items-center gap-[12px] border-b border-[#eef1f6] pb-[10px] text-[12px] font-medium text-[#94a3b8]",
              sourceColumns,
            )}
          >
            <span>Source</span>
            <span>Signals</span>
            <span>% of Total</span>
            <span>High Intent %</span>
            <span>Trend</span>
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
                <span className="font-semibold text-[#0f172a]">{s.signals}</span>
                <span className="text-[#64748b]">{s.pct}</span>
                <span className="text-[#64748b]">{s.high}</span>
                <span className="flex items-center gap-[8px]">
                  <span className="flex items-center gap-[3px] text-[12px] font-semibold text-[#16a34a]">
                    <TrendingUp className="size-[13px]" />
                    {s.trend}
                  </span>
                  <Sparkline
                    className="h-[22px] w-[48px]"
                    color="#16a34a"
                    gradientId={`src-${s.logo}`}
                    values={s.spark}
                  />
                </span>
              </div>
            ))}

            <div className={cn("grid items-center gap-[12px] pt-[12px] text-[13px] font-bold text-[#0f172a]", sourceColumns)}>
              <span>Total</span>
              <span>6,768</span>
              <span>52.8%</span>
              <span />
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

const intentSegments = [
  { label: "High (80-100)", value: 3247, pct: "25.3%", color: "#7c3aed" },
  { label: "Medium (50-79)", value: 6138, pct: "47.7%", color: "#f97316" },
  { label: "Low (20-49)", value: 2832, pct: "22.0%", color: "#2563eb" },
  { label: "Very Low (0-19)", value: 630, pct: "4.9%", color: "#cbd5e1" },
];

function IntentLevelCard() {
  return (
    <section className="flex flex-col rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <CardHead action={<ViewLink />} title="Signals by Intent Level" />
      <div className="mt-[16px] flex flex-1 flex-col items-center gap-[20px] sm:flex-row">
        <div className="relative size-[160px] shrink-0">
          <Donut
            segments={intentSegments.map((s) => ({ value: s.value, color: s.color }))}
            size={160}
            thickness={24}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[19px] font-bold leading-none text-[#0f172a]">12,847</span>
            <span className="mt-[3px] text-[12px] text-[#64748b]">Total</span>
          </div>
        </div>
        <div className="flex w-full flex-1 flex-col gap-[12px]">
          {intentSegments.map((s) => (
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
        High &amp; Medium Intent 73.0%
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Geographic Distribution                                             */
/* ------------------------------------------------------------------ */

const countries = [
  { name: "United States", value: "4,267", pct: "33.2%" },
  { name: "India", value: "1,842", pct: "14.3%" },
  { name: "United Kingdom", value: "982", pct: "7.6%" },
  { name: "Canada", value: "671", pct: "5.2%" },
  { name: "Germany", value: "612", pct: "4.8%" },
];

/* Stylized world-map placeholder (abstract continents, not geographic). */
function WorldMap() {
  const blobs = [
    { cx: 70, cy: 90, rx: 42, ry: 30, o: 0.55 },
    { cx: 96, cy: 150, rx: 24, ry: 40, o: 0.4 },
    { cx: 165, cy: 78, rx: 20, ry: 16, o: 0.5 },
    { cx: 178, cy: 128, rx: 26, ry: 40, o: 0.45 },
    { cx: 250, cy: 92, rx: 55, ry: 34, o: 0.6 },
    { cx: 290, cy: 150, rx: 20, ry: 12, o: 0.35 },
  ];
  return (
    <svg className="h-full w-full" preserveAspectRatio="xMidYMid meet" viewBox="0 0 340 200">
      {blobs.map((b, i) => (
        <ellipse cx={b.cx} cy={b.cy} fill="#7c3aed" fillOpacity={b.o} key={i} rx={b.rx} ry={b.ry} />
      ))}
    </svg>
  );
}

function GeographicCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <CardHead action={<ViewLink />} title="Geographic Distribution" />
      <div className="mt-[16px] flex flex-col gap-[20px] lg:flex-row">
        <div className="flex flex-1 flex-col">
          <div className="h-[180px] w-full rounded-[12px] bg-[#f7f5ff]">
            <WorldMap />
          </div>
          <div className="mt-[12px] flex items-center gap-[10px]">
            <span className="text-[12px] text-[#94a3b8]">Low</span>
            <span className="h-[8px] flex-1 rounded-full bg-gradient-to-r from-[#ede9fe] to-[#6d28d9]" />
            <span className="text-[12px] text-[#94a3b8]">High</span>
          </div>
        </div>
        <div className="w-full lg:w-[220px]">
          <p className="m-0 text-[13px] font-semibold text-[#475569]">Top Countries</p>
          <div className="mt-[12px] flex flex-col gap-[12px]">
            {countries.map((c) => (
              <div className="flex items-center justify-between gap-[10px]" key={c.name}>
                <span className="text-[13px] text-[#334155]">{c.name}</span>
                <span className="whitespace-nowrap text-[13px] text-[#94a3b8]">
                  <span className="font-semibold text-[#0f172a]">{c.value}</span> ({c.pct})
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

const insights: { icon: IconType; bg: string; color: string; text: ReactNode }[] = [
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
        Signals with <b className="font-semibold text-[#0f172a]">intent score 80+</b> have 94.2%
        precision rate.
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

function KeyInsights() {
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

function FooterBar() {
  return (
    <div className="flex flex-col items-center gap-[16px] lg:flex-row lg:justify-between">
      <span className="text-[13px] text-[#64748b]">Showing 1 to 10 of 12,847 signals</span>
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
            <KpiCards />
          </div>

          <div className="mt-[20px] grid grid-cols-1 gap-[20px] xl:grid-cols-3">
            <SignalsOverTimeCard />
            <CategoryCard />
            <DistributionCard />
          </div>

          <div className="mt-[20px] grid grid-cols-1 gap-[20px] xl:grid-cols-3">
            <TopSourcesCard />
            <IntentLevelCard />
            <GeographicCard />
          </div>

          <div className="mt-[20px]">
            <KeyInsights />
          </div>

          <div className="mt-[24px]">
            <FooterBar />
          </div>
        </main>
      </div>
    </div>
  );
}
