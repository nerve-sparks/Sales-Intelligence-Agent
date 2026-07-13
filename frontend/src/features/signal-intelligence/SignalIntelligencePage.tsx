import {
  Activity,
  Aperture,
  ArrowRight,
  Briefcase,
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
import type { ComponentType } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import {
  AIAssistantButton,
  DetectionPill,
  NotificationBell,
  UserMenu,
} from "../../components/layout/TopActions";
import { Delta, Sparkline } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

type IconType = ComponentType<{ className?: string }>;

/* ------------------------------------------------------------------ */
/* Stat cards                                                          */
/* ------------------------------------------------------------------ */

const stats = [
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

function StatCards() {
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

            <p className="m-0 mt-[12px] flex items-center gap-[8px] text-[12px] text-[#94a3b8]">
              <Delta value={stat.delta} />
              vs last 7 days
            </p>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Signal Trend Over Time (multi-line chart)                           */
/* ------------------------------------------------------------------ */

const trendLabels = [
  "May 21",
  "May 22",
  "May 23",
  "May 24",
  "May 25",
  "May 26",
  "May 27",
];

const trendSeries = [
  { label: "Total Signals", color: "#2563eb", values: [1050, 1300, 1300, 1560, 1280, 1540, 1450] },
  { label: "High-Intent Signals", color: "#7c3aed", values: [500, 560, 600, 640, 590, 680, 700] },
  { label: "Medium-Intent Signals", color: "#f97316", values: [270, 320, 340, 330, 320, 350, 360] },
  { label: "Low-Intent Signals", color: "#16a34a", values: [60, 70, 80, 75, 70, 85, 90] },
];

function TrendChart() {
  const w = 640;
  const h = 300;
  const left = 44;
  const right = w - 16;
  const top = 16;
  const bottom = 250;
  const yMax = 2000;
  const gridValues = [
    { v: 0, label: "0" },
    { v: 500, label: "500" },
    { v: 1000, label: "1K" },
    { v: 1500, label: "1.5K" },
    { v: 2000, label: "2K" },
  ];

  const xOf = (i: number) => left + (i * (right - left)) / (trendLabels.length - 1);
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

      {trendSeries.map((s) => {
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

      {trendLabels.map((label, i) => (
        <text
          fill="#94a3b8"
          fontSize="11"
          key={label}
          textAnchor={i === 0 ? "start" : i === trendLabels.length - 1 ? "end" : "middle"}
          x={xOf(i)}
          y={bottom + 28}
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

function SignalTrendCard() {
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
        {trendSeries.map((s) => (
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
        <TrendChart />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Signals by Source Type (donut)                                      */
/* ------------------------------------------------------------------ */

const sourceSegments = [
  { label: "News & Media", color: "#2563eb", pct: "38%", count: "1,082", value: 1082 },
  { label: "Social Signals", color: "#10b981", pct: "28%", count: "796", value: 796 },
  { label: "Web & Tech", color: "#f59e0b", pct: "16%", count: "455", value: 455 },
  { label: "Company Events", color: "#ef4444", pct: "12%", count: "340", value: 340 },
  { label: "Other Sources", color: "#94a3b8", pct: "6%", count: "173", value: 173 },
];

function DonutChart() {
  const size = 220;
  const thickness = 28;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = sourceSegments.reduce((sum, s) => sum + s.value, 0);
  let offset = 0;

  return (
    <svg className="size-full" viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {sourceSegments.map((s) => {
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

function SourceTypeCard() {
  return (
    <section className="flex flex-col rounded-[18px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[18px] font-bold text-[#0f172a]">
        Signals by Source Type
      </h2>

      <div className="mt-[18px] flex flex-1 flex-col items-center gap-[24px] lg:flex-row lg:items-center">
        <div className="relative size-[200px] shrink-0">
          <DonutChart />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[28px] font-bold leading-none text-[#0f172a]">
              2,847
            </span>
            <span className="mt-[4px] text-[13px] text-[#64748b]">Total</span>
          </div>
        </div>

        <div className="flex w-full flex-1 flex-col gap-[14px]">
          {sourceSegments.map((s) => (
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
        View all source breakdown
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

const signalRows: SignalRow[] = [
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

function TopHighIntentSignals() {
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
            {signalRows.map((row) => {
              const Icon = row.icon;

              return (
                <div
                  className={cn("grid items-center gap-[16px] py-[14px]", tableColumns)}
                  key={row.title}
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
  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Signal Intelligence" />

      <div className="flex min-w-0 flex-1 flex-col">
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

            <div className="flex flex-col items-start gap-[16px] xl:items-end">
              <div className="flex flex-wrap items-center gap-[12px]">
                <DetectionPill className="hidden md:flex" icon={RefreshCw} />
                <AIAssistantButton />
                <NotificationBell />
                <UserMenu />
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
          </div>

          <div className="mt-[22px]">
            <StatCards />
          </div>

          <div className="mt-[22px] grid grid-cols-1 gap-[20px] xl:grid-cols-[1.6fr_1fr]">
            <SignalTrendCard />
            <SourceTypeCard />
          </div>

          <div className="mt-[22px]">
            <TopHighIntentSignals />
          </div>
        </main>
      </div>
    </div>
  );
}
