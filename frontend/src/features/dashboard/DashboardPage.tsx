import {
  Building2,
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
import earthImage from "../../assets/earth.png";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import {
  Delta,
  Sparkline,
  UpTriangle,
  smoothPath,
  toPoints,
} from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";

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

const trendSeries = [
  { color: "#7c3aed", values: [22, 26, 17, 33, 27, 32, 40] },
  { color: "#f97316", values: [17, 12, 18, 24, 19, 26, 30] },
  { color: "#2563eb", values: [12, 14, 8, 20, 15, 13, 19] },
];
const trendLabels = ["May 14", "May 15", "May 16", "May 17", "May 18", "May 19", "May 20"];

function TrendChart() {
  const w = 580;
  const h = 250;
  const left = 34;
  const right = w - 14;
  const top = 14;
  const bottom = 205;
  const yMax = 45;
  const gridValues = [0, 10, 20, 30, 40];

  const xOf = (i: number) => left + (i * (right - left)) / (trendLabels.length - 1);
  const yOf = (v: number) => bottom - (v / yMax) * (bottom - top);

  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        {trendSeries.map((s, i) => (
          <linearGradient id={`trend-${i}`} key={i} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.14" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>

      {gridValues.map((v) => (
        <g key={v}>
          <line
            stroke="#eef2f7"
            strokeWidth="1"
            x1={left}
            x2={right}
            y1={yOf(v)}
            y2={yOf(v)}
          />
          <text
            fill="#94a3b8"
            fontSize="11"
            textAnchor="end"
            x={left - 8}
            y={yOf(v) + 4}
          >
            {v}
          </text>
        </g>
      ))}

      {trendSeries.map((s, i) => {
        const pts = s.values.map((v, idx) => ({ x: xOf(idx), y: yOf(v) }));
        const line = smoothPath(pts);
        const area = `${line} L ${pts[pts.length - 1].x} ${bottom} L ${pts[0].x} ${bottom} Z`;

        return (
          <g key={i}>
            <path d={area} fill={`url(#trend-${i})`} />
            <path
              d={line}
              fill="none"
              stroke={s.color}
              strokeLinecap="round"
              strokeWidth="2.5"
            />
            {pts.map((p, idx) => (
              <circle
                cx={p.x}
                cy={p.y}
                fill="#ffffff"
                key={idx}
                r="3.4"
                stroke={s.color}
                strokeWidth="2"
              />
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
          y={bottom + 26}
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

function PipelineAreaChart() {
  const w = 420;
  const h = 150;
  const values = [30, 44, 38, 56, 62, 50, 66, 74, 62, 70, 58, 64];
  const pts = toPoints(values, w, h, 6);
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x} ${h} L ${pts[0].x} ${h} Z`;
  const marker = pts[8];

  return (
    <svg className="w-full" preserveAspectRatio="none" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="pipe-fill" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="pipe-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#pipe-area)" />
      <path
        d={line}
        fill="none"
        stroke="url(#pipe-fill)"
        strokeLinecap="round"
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={marker.x}
        cy={marker.y}
        fill="#2563eb"
        r="3.4"
        stroke="#ffffff"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const miniBarHeights = [
  32, 46, 38, 54, 44, 62, 50, 68, 58, 74, 64, 80, 70, 88,
];

function MiniBars() {
  return (
    <div className="flex h-[38px] items-end gap-[3px]">
      {miniBarHeights.map((height, i) => (
        <span
          className="w-[5px] rounded-[2px] bg-gradient-to-t from-[#7c3aed] to-[#c084fc]"
          key={i}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat cards                                                          */
/* ------------------------------------------------------------------ */

const stats = [
  {
    icon: Flame,
    iconBg: "bg-[#fff1e8]",
    iconColor: "text-[#f97316]",
    label: "Hot Prospects",
    value: "148",
    delta: "24.3%",
    color: "#ef4444",
    values: [30, 34, 28, 40, 33, 45, 38, 44, 36, 48, 42, 52],
  },
  {
    icon: DollarSign,
    iconBg: "bg-[#e8f0ff]",
    iconColor: "text-[#2563eb]",
    label: "Pipeline Value",
    value: "$4.8M",
    delta: "15.7%",
    color: "#2563eb",
    values: [20, 26, 22, 30, 25, 34, 29, 38, 33, 42, 44, 50],
  },
  {
    icon: Radio,
    iconBg: "bg-[#f3e8ff]",
    iconColor: "text-[#7c3aed]",
    label: "New Signals",
    value: "23",
    delta: "21.0%",
    color: "#7c3aed",
    values: [22, 20, 26, 24, 30, 27, 33, 31, 36, 34, 40, 42],
  },
  {
    icon: Calendar,
    iconBg: "bg-[#fff1e8]",
    iconColor: "text-[#f97316]",
    label: "Meetings Booked",
    value: "17",
    delta: "13.3%",
    color: "#f97316",
    values: [18, 24, 20, 28, 23, 30, 26, 33, 29, 36, 34, 40],
  },
  {
    icon: Target,
    iconBg: "bg-[#e8f0ff]",
    iconColor: "text-[#2563eb]",
    label: "Conversion Rate",
    value: "22.4%",
    delta: "3.6%",
    color: "#2563eb",
    values: [24, 22, 28, 25, 30, 27, 32, 29, 34, 31, 36, 38],
  },
];

function StatCards() {
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
              <Delta value={stat.delta} />
            </div>
            <p className="m-0 mt-[6px] text-[12px] text-[#94a3b8]">vs last 7 days</p>

            <div className="mt-[10px]">
              <Sparkline
                color={stat.color}
                gradientId={`spark-${stat.label.replace(/\s+/g, "")}`}
                values={stat.values}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lead Opportunity Map (dark card)                                    */
/* ------------------------------------------------------------------ */

const mapLegend = [
  { label: "Hot Zone", range: "80-100", color: "#ef4444" },
  { label: "Warm Zone", range: "60-79", color: "#f97316" },
  { label: "Emerging", range: "40-59", color: "#3b82f6" },
  { label: "Monitor", range: "0-39", color: "#94a3b8" },
];

function LeadOpportunityMap() {
  return (
    <section className="relative flex min-h-[420px] flex-col overflow-hidden rounded-[18px] bg-[#0a1020] p-[24px] text-white">
      <img
        alt=""
        className="pointer-events-none absolute -right-[2%] top-1/2 z-0 h-auto w-[66%] max-w-none -translate-y-1/2 select-none"
        draggable={false}
        src={earthImage}
      />
      <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-r from-[#0a1020] via-[#0a1020]/55 to-transparent" />

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

      <div className="absolute right-[26px] top-[150px] z-10 hidden w-[220px] rounded-[12px] border border-white/10 bg-[#111a2e]/85 p-[14px] backdrop-blur-sm sm:block">
        <p className="m-0 text-[13px] font-bold text-white">ABC Accounting Group</p>
        <p className="m-0 mt-[6px] text-[11px] text-[#cbd5e1]">
          Lead Score <span className="font-bold text-white">92</span> •{" "}
          <span className="text-[#f97316]">Hot Zone</span>
        </p>
        <div className="mt-[10px] flex items-center justify-between">
          <span className="text-[11px] text-[#94a3b8]">New Lead Joined</span>
          <span className="flex size-[26px] items-center justify-center rounded-full bg-gradient-to-r from-[#f5417f] to-[#c531d6] text-white">
            <Send className="size-[13px]" />
          </span>
        </div>
      </div>

      <div className="relative z-10 mt-auto flex flex-col gap-[14px] pt-[22px] lg:flex-row lg:items-end lg:justify-between">
        <div className="w-fit rounded-[12px] border border-white/10 bg-white/5 p-[14px] backdrop-blur-sm">
          <p className="m-0 text-[12px] text-[#94a3b8]">Live Opportunities</p>
          <div className="mt-[4px] flex items-end gap-[10px]">
            <span className="text-[26px] font-bold leading-none text-white">
              2,450
            </span>
            <MiniBars />
          </div>
          <p className="m-0 mt-[8px] flex items-center gap-[6px] text-[12px] text-[#94a3b8]">
            <span className="inline-flex items-center gap-[3px] font-semibold text-[#4ade80]">
              <UpTriangle className="size-[8px]" />
              18.6%
            </span>
            vs last 7 days
          </p>
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

const trendBuckets = [
  { label: "High", value: "10", className: "bg-[#f5f3ff] text-[#7c3aed]" },
  { label: "Medium", value: "8", className: "bg-[#fff7ed] text-[#f97316]" },
  { label: "Low", value: "5", className: "bg-[#eff6ff] text-[#2563eb]" },
];

function LeadTrend() {
  return (
    <section className="flex flex-col rounded-[18px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[18px] font-bold text-[#0f172a]">Lead Trend</h2>
        <button
          className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[12px] py-[7px] text-[13px] font-semibold text-[#475569]"
          type="button"
        >
          This Week
          <ChevronDown className="size-[14px] text-[#94a3b8]" />
        </button>
      </div>

      <div className="mt-[14px] flex items-center gap-[10px]">
        <span className="text-[26px] font-bold leading-none text-[#0f172a]">23</span>
        <span className="text-[14px] font-semibold text-[#64748b]">Total Leads</span>
      </div>
      <p className="m-0 mt-[8px] flex items-center gap-[8px] text-[12px] text-[#94a3b8]">
        <Delta value="21.0%" />
        vs last 7 days
      </p>

      <div className="mt-[10px] flex-1">
        <TrendChart />
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

const prospects = [
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

function TopPriorityProspects() {
  return (
    <section className="rounded-[18px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[17px] font-bold text-[#0f172a]">
          Top Priority Prospects
        </h2>
        <button className="text-[13px] font-semibold text-[#2563eb]" type="button">
          View All
        </button>
      </div>

      <div className="mt-[16px] grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-[16px] border-b border-[#eef1f6] pb-[10px] text-[11px] font-semibold uppercase tracking-[0.02em] text-[#94a3b8]">
        <span>Company</span>
        <span className="text-center">Lead Score</span>
        <span className="text-center">Trend</span>
        <span className="whitespace-nowrap">Next Best Action</span>
      </div>

      <div className="divide-y divide-[#f1f5f9]">
        {prospects.map((row) => (
          <div
            className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-[16px] py-[12px]"
            key={row.company}
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

const signals = [
  {
    time: "2m ago",
    company: "Thomson & Associates",
    action: "PE Acquisition",
    tone: "red",
    score: 95,
    ring: "green",
    iconBg: "bg-[#db2777]",
  },
  {
    time: "15m ago",
    company: "ABC Accounting Group",
    action: "New Lead Joined",
    tone: "blue",
    score: 92,
    ring: "green",
    iconBg: "bg-[#2563eb]",
  },
  {
    time: "1h ago",
    company: "Clifton Larson Allen",
    action: "Competitor AI Move",
    tone: "purple",
    score: 78,
    ring: "orange",
    iconBg: "bg-[#0f766e]",
  },
  {
    time: "2h ago",
    company: "Plante Moran",
    action: "Hiring Freeze",
    tone: "orange",
    score: 69,
    ring: "orange",
    iconBg: "bg-[#f97316]",
  },
  {
    time: "3h ago",
    company: "Crowe LLP",
    action: "Regulatory Change",
    tone: "blue",
    score: 65,
    ring: "orange",
    iconBg: "bg-[#2563eb]",
  },
];

function RecentSignals() {
  return (
    <section className="rounded-[18px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[17px] font-bold text-[#0f172a]">Recent Signals</h2>
        <button className="text-[13px] font-semibold text-[#2563eb]" type="button">
          View All
        </button>
      </div>

      <div className="mt-[8px] divide-y divide-[#f1f5f9]">
        {signals.map((signal) => (
          <div className="flex items-center gap-[12px] py-[13px]" key={signal.company}>
            <span
              className={cn(
                "flex size-[38px] shrink-0 items-center justify-center rounded-[10px] text-white",
                signal.iconBg,
              )}
            >
              <Building2 className="size-[19px]" />
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
/* Pipeline Overview                                                   */
/* ------------------------------------------------------------------ */

const pipelineStats = [
  { label: "Active Opportunities", value: "64", delta: "12%" },
  { label: "Proposal Sent", value: "18", delta: "8%" },
  { label: "Negotiation", value: "9", delta: "3%" },
  { label: "Won Deals", value: "7", delta: "16%" },
  { label: "Win Rate", value: "21.9%", delta: "4.1%" },
  { label: "Avg. Deal Size", value: "$42K", delta: "7.2%" },
];

function PipelineOverview() {
  return (
    <section className="rounded-[18px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[17px] font-bold text-[#0f172a]">
          Pipeline Overview
        </h2>
        <button
          className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[12px] py-[7px] text-[13px] font-semibold text-[#475569]"
          type="button"
        >
          This Month
          <ChevronDown className="size-[14px] text-[#94a3b8]" />
        </button>
      </div>

      <p className="m-0 mt-[14px] text-[12px] text-[#94a3b8]">Total Pipeline Value</p>
      <div className="mt-[4px] flex items-end gap-[10px]">
        <span className="text-[28px] font-bold leading-none text-[#0f172a]">
          $4.8M
        </span>
        <Delta value="15.7%" />
        <span className="text-[12px] text-[#94a3b8]">vs last month</span>
      </div>

      <div className="relative mt-[14px]">
        <span className="absolute right-0 top-0 z-10 rounded-[8px] border border-[#e2e8f0] bg-white px-[10px] py-[4px] text-[11px] font-semibold text-[#64748b] shadow-[0px_1px_2px_rgba(15,23,42,0.05)]">
          Target: $6.0M
        </span>
        <PipelineAreaChart />
      </div>

      <div className="mt-[16px] grid grid-cols-3 gap-x-[14px] gap-y-[16px] border-t border-[#f1f5f9] pt-[16px]">
        {pipelineStats.map((stat) => (
          <div key={stat.label}>
            <p className="m-0 text-[12px] font-medium text-[#94a3b8]">
              {stat.label}
            </p>
            <div className="mt-[4px] flex items-center gap-[8px]">
              <span className="text-[20px] font-bold leading-none text-[#0f172a]">
                {stat.value}
              </span>
              <Delta value={stat.delta} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function DashboardPage() {
  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Dashboard" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />

        <main className="flex-1 overflow-x-hidden px-[24px] py-[24px]">
          <div className="flex items-start justify-between gap-[16px]">
            <div>
              <h1 className="m-0 flex items-center gap-[8px] text-[26px] font-bold text-[#0f172a]">
                Good morning, Arjun! <span aria-hidden="true">👋</span>
              </h1>
              <p className="m-0 mt-[6px] text-[15px] text-[#64748b]">
                Your AI is working hard to uncover high-conversion opportunities.
              </p>
            </div>
            <button
              className="flex shrink-0 items-center gap-[10px] rounded-[12px] border border-[#e9edf5] bg-white px-[16px] py-[11px] text-[14px] font-semibold text-[#0f172a]"
              type="button"
            >
              <Calendar className="size-[17px] text-[#64748b]" />
              May 20, 2025 (Tue)
              <ChevronDown className="size-[15px] text-[#94a3b8]" />
            </button>
          </div>

          <div className="mt-[22px]">
            <StatCards />
          </div>

          <div className="mt-[22px] grid grid-cols-1 gap-[20px] xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <LeadOpportunityMap />
            <LeadTrend />
          </div>

          <div className="mt-[22px] grid grid-cols-1 gap-[20px] xl:grid-cols-[1.35fr_0.9fr_1.05fr]">
            <TopPriorityProspects />
            <RecentSignals />
            <PipelineOverview />
          </div>
        </main>
      </div>
    </div>
  );
}
