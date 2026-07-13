import {
  Atom,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Database,
  ExternalLink,
  Info,
  Inbox,
  Layers,
  MoreVertical,
  Radio,
  Rocket,
  Share2,
  Snowflake,
  Sparkles,
  Triangle,
  TrendingUp,
} from "lucide-react";
import type { ComponentType } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { UpTriangle } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function LogoSquare({
  icon: Icon,
  text,
  bg,
  color,
  size = 40,
  radius = 10,
}: {
  icon?: ComponentType<{ className?: string }>;
  text?: string;
  bg: string;
  color: string;
  size?: number;
  radius?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center text-[13px] font-bold"
      style={{
        backgroundColor: bg,
        color,
        width: size,
        height: size,
        borderRadius: radius,
      }}
    >
      {Icon ? <Icon className="size-[20px]" /> : text}
    </span>
  );
}

const tagTones: Record<string, string> = {
  purple: "bg-[#f3e9ff] text-[#7c3aed]",
  gray: "bg-[#f1f5f9] text-[#64748b]",
  green: "bg-[#e7f8ef] text-[#16a34a]",
  blue: "bg-[#e6f0ff] text-[#2563eb]",
  orange: "bg-[#fff1e3] text-[#f97316]",
};

function Tag({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-[6px] px-[10px] py-[4px] text-[12px] font-semibold",
        tagTones[tone],
      )}
    >
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function DetailHeader() {
  return (
    <div className="flex flex-col gap-[18px] xl:flex-row xl:items-start xl:justify-between">
      <div className="flex items-start gap-[18px]">
        <LogoSquare bg="#0f172a" color="#ffffff" icon={Triangle} radius={14} size={64} />
        <div>
          <div className="flex flex-wrap items-center gap-[12px]">
            <h1 className="m-0 text-[24px] font-bold text-[#0f172a]">
              Series B funding round announced
            </h1>
            <span className="rounded-[7px] bg-[#f3e9ff] px-[10px] py-[4px] text-[12px] font-semibold text-[#7c3aed]">
              High Intent
            </span>
          </div>
          <p className="m-0 mt-[8px] text-[14px] text-[#64748b]">
            <span className="font-semibold text-[#334155]">Acme Corp</span> • Detected
            on May 20, 2025 10:15 AM (8m ago)
          </p>
          <div className="mt-[12px] flex flex-wrap gap-[8px]">
            <Tag label="Funding & Investment" tone="purple" />
            <Tag label="Press Release" tone="gray" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-[10px]">
        <button
          className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-semibold text-[#334155]"
          type="button"
        >
          <Bookmark className="size-[16px]" />
          Add to Watchlist
        </button>
        <button
          className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-semibold text-[#334155]"
          type="button"
        >
          <Share2 className="size-[16px]" />
          Share
        </button>
        <button
          className="flex items-center gap-[8px] rounded-[10px] bg-[#5b3df5] px-[16px] py-[10px] text-[14px] font-semibold text-white shadow-[0px_10px_20px_-6px_rgba(91,61,245,0.45)]"
          type="button"
        >
          <Check className="size-[16px]" />
          Validate Signal
        </button>
        <button
          aria-label="More actions"
          className="flex size-[42px] items-center justify-center rounded-[10px] border border-[#e9edf5] bg-white text-[#64748b]"
          type="button"
        >
          <MoreVertical className="size-[17px]" />
        </button>
      </div>
    </div>
  );
}

const tabs = [
  "Overview",
  "Signal Data",
  "Source & Evidence",
  "Impact Analysis",
  "History",
  "Related Signals",
];

function DetailTabs() {
  return (
    <div className="mt-[20px] flex gap-[28px] overflow-x-auto border-b border-[#e9edf5]">
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
/* Intent score + charts                                               */
/* ------------------------------------------------------------------ */

function IntentScoreCard() {
  return (
    <div className="max-w-[420px] rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <p className="m-0 text-[14px] font-semibold text-[#475569]">Intent Score</p>
      <div className="mt-[10px] flex items-center gap-[12px]">
        <span className="text-[30px] font-bold leading-none text-[#0f172a]">
          96 <span className="text-[18px] font-semibold text-[#94a3b8]">/ 100</span>
        </span>
        <span className="rounded-[7px] bg-[#f3e9ff] px-[10px] py-[4px] text-[12px] font-semibold text-[#7c3aed]">
          High
        </span>
      </div>
      <p className="m-0 mt-[10px] flex items-center gap-[6px] text-[13px] font-medium text-[#16a34a]">
        <UpTriangle className="size-[9px]" />
        12 pts vs last 7 days
      </p>
      <div className="mt-[12px] h-[6px] w-full rounded-full bg-[#e5e7eb]">
        <div className="h-full rounded-full bg-[#22c55e]" style={{ width: "96%" }} />
      </div>
    </div>
  );
}

const scoreOverTime = [72, 78, 81, 88, 90, 93, 96];
const scoreLabels = ["May 14", "May 15", "May 16", "May 17", "May 18", "May 19", "May 20"];

function IntentScoreLineChart() {
  const w = 620;
  const h = 270;
  const left = 40;
  const right = w - 20;
  const top = 42;
  const bottom = 212;
  const gridValues = [0, 25, 50, 75, 100];

  const xOf = (i: number) => left + (i * (right - left)) / (scoreLabels.length - 1);
  const yOf = (v: number) => bottom - (v / 100) * (bottom - top);
  const points = scoreOverTime.map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ");

  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h}`}>
      {gridValues.map((v) => (
        <g key={v}>
          <line stroke="#eef2f7" strokeWidth="1" x1={left} x2={right} y1={yOf(v)} y2={yOf(v)} />
          <text fill="#94a3b8" fontSize="11" textAnchor="end" x={left - 8} y={yOf(v) + 4}>
            {v}
          </text>
        </g>
      ))}

      <polyline
        fill="none"
        points={points}
        stroke="#7c3aed"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />

      {scoreOverTime.map((v, i) => (
        <g key={i}>
          <circle cx={xOf(i)} cy={yOf(v)} fill="#7c3aed" r="4" />
          <text
            fill="#0f172a"
            fontSize="12"
            fontWeight="700"
            textAnchor="middle"
            x={xOf(i)}
            y={yOf(v) - 12}
          >
            {v}
          </text>
        </g>
      ))}

      {scoreLabels.map((label, i) => (
        <text
          fill="#94a3b8"
          fontSize="11"
          key={label}
          textAnchor={i === 0 ? "start" : i === scoreLabels.length - 1 ? "end" : "middle"}
          x={xOf(i)}
          y={bottom + 26}
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

const breakdown = [
  { label: "Event Significance", color: "#7c3aed", got: 25, max: 25 },
  { label: "Source Credibility", color: "#f97316", got: 23, max: 25 },
  { label: "Relevance Score", color: "#2563eb", got: 20, max: 20 },
  { label: "Recency", color: "#16a34a", got: 15, max: 15 },
  { label: "Signal Consistency", color: "#94a3b8", got: 13, max: 15 },
];

function ScoreDonut() {
  const size = 190;
  const thickness = 24;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const segments = [
    ...breakdown.map((b) => ({ value: b.got, color: b.color })),
    { value: 4, color: "#e5e7eb" },
  ];
  let offset = 0;

  return (
    <svg className="size-full" viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segments.map((s, i) => {
          const len = (s.value / 100) * circumference;
          const dash = Math.max(len - 3, 0);
          const el = (
            <circle
              cx={size / 2}
              cy={size / 2}
              fill="none"
              key={i}
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

function IntentScoreBreakdownCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Intent Score Breakdown</h2>

      <div className="mt-[16px] flex flex-col items-center gap-[22px] sm:flex-row">
        <div className="relative size-[170px] shrink-0">
          <ScoreDonut />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[22px] font-bold leading-none text-[#0f172a]">
              96 <span className="text-[14px] text-[#94a3b8]">/ 100</span>
            </span>
            <span className="mt-[4px] text-[12px] text-[#7c3aed]">High Intent</span>
          </div>
        </div>

        <div className="flex w-full flex-1 flex-col gap-[12px]">
          {breakdown.map((b) => (
            <div className="flex items-center justify-between gap-[12px]" key={b.label}>
              <span className="flex items-center gap-[10px]">
                <span
                  className="size-[10px] rounded-full"
                  style={{ backgroundColor: b.color }}
                />
                <span className="text-[13px] font-medium text-[#334155]">{b.label}</span>
              </span>
              <span className="whitespace-nowrap text-[13px] font-semibold text-[#0f172a]">
                {b.got} <span className="font-normal text-[#94a3b8]">/ {b.max}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <button
        className="mt-[18px] text-[13px] font-semibold text-[#5b3df5]"
        type="button"
      >
        View scoring methodology
      </button>
    </section>
  );
}

function IntentScoreOverTimeCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">
          Intent Score Over Time
          <Info className="size-[15px] text-[#94a3b8]" />
        </h2>
        <button
          className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[12px] py-[7px] text-[13px] font-semibold text-[#475569]"
          type="button"
        >
          Last 7 Days
          <ChevronDown className="size-[14px] text-[#94a3b8]" />
        </button>
      </div>
      <div className="mt-[12px]">
        <IntentScoreLineChart />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Details / Source / Similar companies                                */
/* ------------------------------------------------------------------ */

const detailRows: { label: string; value: string; logo?: boolean }[] = [
  { label: "Detected", value: "May 20, 2025 10:15 AM (8m ago)" },
  { label: "Source", value: "TechCrunch", logo: true },
  { label: "Source Type", value: "News Publication" },
  { label: "Location", value: "United States" },
  { label: "Employees", value: "501-1K" },
  { label: "Revenue", value: "$50M - $100M" },
  { label: "Industry", value: "Software Development" },
];

function SignalDetailsCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Signal Details</h2>

      <dl className="mt-[16px] flex flex-col gap-[12px]">
        {detailRows.map((row) => (
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-[12px]" key={row.label}>
            <dt className="text-[13px] text-[#94a3b8]">{row.label}</dt>
            <dd className="m-0 flex items-center gap-[8px] text-[13px] font-medium text-[#334155]">
              {row.logo && (
                <LogoSquare bg="#dcfce7" color="#16a34a" radius={6} size={22} text="TC" />
              )}
              {row.value}
            </dd>
          </div>
        ))}

        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-[12px]">
          <dt className="text-[13px] text-[#94a3b8]">Tags</dt>
          <dd className="m-0 flex flex-wrap gap-[6px]">
            {["Funding", "Growth", "Expansion", "AI"].map((t) => (
              <Tag key={t} label={t} tone="purple" />
            ))}
          </dd>
        </div>

        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-[12px]">
          <dt className="text-[13px] text-[#94a3b8]">Description</dt>
          <dd className="m-0 text-[13px] leading-[20px] text-[#334155]">
            Acme Corp raised $25M in Series B funding led by Sequoia Capital. The round
            will fuel expansion of their AI-powered platform and accelerate go-to-market
            efforts in enterprise.
          </dd>
        </div>
      </dl>
    </section>
  );
}

function SourceSnippetCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Source Snippet</h2>

      <div className="mt-[16px] flex items-center gap-[10px]">
        <LogoSquare bg="#dcfce7" color="#16a34a" radius={6} size={26} text="TC" />
        <div className="leading-tight">
          <p className="m-0 text-[13px] font-semibold text-[#0f172a]">TechCrunch</p>
          <p className="m-0 text-[12px] text-[#94a3b8]">May 20, 2025 10:00 AM</p>
        </div>
      </div>

      <p className="m-0 mt-[16px] text-[14px] font-bold leading-[21px] text-[#0f172a]">
        Acme Corp raises $25M in Series B funding led by Sequoia Capital
      </p>
      <p className="m-0 mt-[10px] text-[13px] leading-[20px] text-[#64748b]">
        Acme Corp, an AI-powered platform for enterprise automation, today announced it
        has raised $25 million in Series B funding led by Sequoia Capital, with
        participation from existing investors...
      </p>
      <button
        className="mt-[16px] flex items-center gap-[7px] text-[13px] font-semibold text-[#5b3df5]"
        type="button"
      >
        Read full article
        <ExternalLink className="size-[14px]" />
      </button>
    </section>
  );
}

const similarCompanies = [
  { name: "Databricks", category: "Software Development", score: 92, icon: Layers, bg: "#fdecec", color: "#ef4444" },
  { name: "Snowflake", category: "Data Infrastructure", score: 90, icon: Snowflake, bg: "#eaf6fd", color: "#29b5e8" },
  { name: "OpenAI", category: "AI / Machine Learning", score: 89, icon: Atom, bg: "#0f172a", color: "#ffffff" },
];

function SimilarCompaniesCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Similar Companies</h2>

      <div className="mt-[16px] flex flex-col gap-[16px]">
        {similarCompanies.map((c) => (
          <div className="flex items-center gap-[12px]" key={c.name}>
            <LogoSquare bg={c.bg} color={c.color} icon={c.icon} radius={10} size={40} />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[14px] font-bold text-[#0f172a]">{c.name}</p>
              <p className="m-0 text-[12px] text-[#94a3b8]">{c.category}</p>
            </div>
            <span className="whitespace-nowrap text-[12px] text-[#94a3b8]">
              Seedly Score: <span className="font-semibold text-[#334155]">{c.score}</span>
            </span>
          </div>
        ))}
      </div>

      <button
        className="mt-[18px] flex items-center gap-[6px] text-[13px] font-semibold text-[#5b3df5]"
        type="button"
      >
        View all similar companies
        <ChevronRight className="size-[15px]" />
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Activity timeline                                                   */
/* ------------------------------------------------------------------ */

const timeline = [
  { icon: Radio, bg: "#e6f0ff", color: "#2563eb", title: "Signal Detected", time: "May 20, 2025\n10:15 AM", desc: "Initial signal detected from TechCrunch" },
  { icon: Database, bg: "#e7f8ef", color: "#16a34a", title: "Data Enriched", time: "May 20, 2025\n10:16 AM", desc: "Company data and context added" },
  { icon: Sparkles, bg: "#f3e9ff", color: "#7c3aed", title: "AI Analysis Complete", time: "May 20, 2025\n10:16 AM", desc: "Intent score and insights generated" },
  { icon: Inbox, bg: "#fff1e3", color: "#f97316", title: "Added to Queue", time: "May 20, 2025\n10:16 AM", desc: "Queued for human review" },
  { icon: Clock, bg: "#fdecec", color: "#ef4444", title: "Pending Review", time: "May 20, 2025\n10:16 AM", desc: "Waiting for analyst review" },
];

function ActivityTimeline() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Signal Activity Timeline</h2>

      <div className="mt-[20px] grid grid-cols-1 gap-[24px] sm:grid-cols-2 lg:grid-cols-5">
        {timeline.map((step, index) => {
          const Icon = step.icon;

          return (
            <div className="relative" key={step.title}>
              <div className="flex items-center">
                <span
                  className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px]"
                  style={{ backgroundColor: step.bg, color: step.color }}
                >
                  <Icon className="size-[19px]" />
                </span>
                {index < timeline.length - 1 && (
                  <span className="relative mx-[8px] hidden h-px flex-1 lg:block">
                    <span className="absolute inset-0 border-t border-dashed border-[#cbd5e1]" />
                    <span className="absolute left-1/2 top-1/2 size-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c7d2fe]" />
                  </span>
                )}
              </div>
              <div className="mt-[12px]">
                <p className="m-0 text-[14px] font-bold text-[#0f172a]">{step.title}</p>
                <p className="m-0 mt-[3px] whitespace-pre-line text-[12px] text-[#94a3b8]">
                  {step.time}
                </p>
                <p className="m-0 mt-[8px] text-[12px] leading-[18px] text-[#64748b]">
                  {step.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Right rail                                                          */
/* ------------------------------------------------------------------ */

function SignalStatusCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Signal Status</h2>
      <p className="m-0 mt-[14px] flex items-center gap-[8px] text-[15px] font-bold text-[#f97316]">
        <Clock className="size-[18px]" />
        Pending Review
      </p>
      <p className="m-0 mt-[10px] text-[13px] leading-[20px] text-[#64748b]">
        This signal is in the review queue and will be validated by our team. Queued on
        May 20, 2025 10:16 AM
      </p>

      <p className="m-0 mt-[18px] text-[14px] font-bold text-[#0f172a]">Next Steps</p>
      <div className="mt-[12px] flex flex-col gap-[12px]">
        {[
          "Review and validate signal",
          "Enrich with additional data",
          "Add to validated signals",
        ].map((step, i) => (
          <div className="flex items-center gap-[12px]" key={step}>
            <span className="flex size-[24px] shrink-0 items-center justify-center rounded-full bg-[#eef1ff] text-[12px] font-bold text-[#5b3df5]">
              {i + 1}
            </span>
            <span className="text-[13px] text-[#334155]">{step}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AISummaryCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">
        AI Summary
        <span className="rounded-[6px] bg-[#f3e9ff] px-[7px] py-[2px] text-[11px] font-semibold text-[#7c3aed]">
          Beta
        </span>
      </h2>
      <p className="m-0 mt-[12px] text-[13px] leading-[20px] text-[#475569]">
        Acme Corp has announced a $25M Series B funding round led by Sequoia Capital. The
        funding will be used to expand their AI platform and enter new markets. This
        represents a strong growth signal with intent based on the company's funding
        history and market position.
      </p>
      <button
        className="mt-[16px] flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[9px] text-[13px] font-semibold text-[#334155]"
        type="button"
      >
        <Copy className="size-[15px]" />
        Copy Summary
      </button>
    </section>
  );
}

const similarSignals = [
  { icon: Triangle, bg: "#f1f5f9", color: "#64748b", title: "Acme Corp raised Series A", date: "Mar 5, 2024", score: 88 },
  { icon: Rocket, bg: "#f3e9ff", color: "#7c3aed", title: "Acme Corp product launch", date: "Jan 10, 2024", score: 82 },
  { icon: TrendingUp, bg: "#e7f8ef", color: "#16a34a", title: "Acme Corp expansion", date: "Nov 5, 2023", score: 76 },
];

function SimilarSignalsCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Similar Signals</h2>
        <button className="text-[13px] font-semibold text-[#5b3df5]" type="button">
          View All
        </button>
      </div>

      <div className="mt-[16px] flex flex-col gap-[16px]">
        {similarSignals.map((s) => (
          <div className="flex items-center gap-[12px]" key={s.title}>
            <LogoSquare bg={s.bg} color={s.color} icon={s.icon} radius={10} size={38} />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[14px] font-bold text-[#0f172a]">{s.title}</p>
              <p className="m-0 text-[12px] text-[#94a3b8]">{s.date}</p>
            </div>
            <div className="text-right">
              <p className="m-0 text-[11px] text-[#94a3b8]">Intent Score</p>
              <p className="m-0 text-[15px] font-bold text-[#0f172a]">{s.score}</p>
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

export function SignalDetailPage() {
  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Signal Intelligence" activeSub="Signal Feed" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          searchPlaceholder="Search companies, triggers, executives..."
          showDetection={false}
        />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          <nav className="flex items-center gap-[8px] text-[13px]">
            <a className="text-[#64748b] no-underline hover:text-[#334155]" href="/signal-feed">
              Signal Feed
            </a>
            <ChevronRight className="size-[14px] text-[#cbd5e1]" />
            <span className="font-semibold text-[#0f172a]">Signal Detail</span>
          </nav>

          <div className="mt-[16px]">
            <DetailHeader />
          </div>

          <DetailTabs />

          <div className="mt-[24px] grid grid-cols-1 gap-[24px] xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-[24px]">
              <IntentScoreCard />

              <div className="grid grid-cols-1 gap-[24px] lg:grid-cols-[1.45fr_1fr]">
                <IntentScoreOverTimeCard />
                <IntentScoreBreakdownCard />
              </div>

              <div className="grid grid-cols-1 gap-[24px] lg:grid-cols-3">
                <SignalDetailsCard />
                <SourceSnippetCard />
                <SimilarCompaniesCard />
              </div>

              <ActivityTimeline />
            </div>

            <div className="flex flex-col gap-[24px]">
              <SignalStatusCard />
              <AISummaryCard />
              <SimilarSignalsCard />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
