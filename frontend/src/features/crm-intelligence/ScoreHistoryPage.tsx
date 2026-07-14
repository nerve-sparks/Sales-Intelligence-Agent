import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Info,
  Lightbulb,
  Upload,
} from "lucide-react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Donut, smoothPath } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

const toneClass: Record<string, string> = {
  green: "bg-[#e7f8ef] text-[#16a34a]",
  red: "bg-[#fee2e2] text-[#ef4444]",
  blue: "bg-[#e6f0ff] text-[#2563eb]",
};

function Badge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-[6px] px-[8px] py-[3px] text-[11px] font-semibold", toneClass[tone])}>
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Header + summary                                                    */
/* ------------------------------------------------------------------ */

function Header() {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-[12px]">
        <div>
          <nav className="flex items-center gap-[8px] text-[13px] text-[#64748b]">
            <a className="font-semibold text-[#5b3df5] no-underline" href="/score-breakdown">Score Breakdown</a>
            <ChevronRight className="size-[14px] text-[#cbd5e1]" />
            <span className="font-semibold text-[#0f172a]">Acme Corporation</span>
          </nav>
          <h1 className="m-0 mt-[10px] text-[26px] font-bold text-[#0f172a]">Score History</h1>
          <p className="m-0 mt-[6px] text-[15px] text-[#64748b]">
            Track how Acme Corporation's score has changed over time and what influenced those changes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-[10px]">
          <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[10px] text-[14px] font-semibold text-[#334155]" type="button"><Upload className="size-[16px]" /> Export</button>
          <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[10px] text-[14px] font-semibold text-[#334155]" type="button"><Filter className="size-[16px]" /> Filters</button>
        </div>
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-px overflow-hidden rounded-[16px] border border-[#eef1f6] bg-[#eef1f6] lg:grid-cols-[minmax(0,1.7fr)_1fr_1fr_1fr_1fr]">
        <div className="flex items-center gap-[14px] bg-white p-[18px]">
          <span className="flex size-[48px] shrink-0 items-center justify-center rounded-[12px] bg-[#e6f0ff] text-[15px] font-bold text-[#2563eb]">AC</span>
          <div className="min-w-0">
            <div className="flex items-center gap-[8px]">
              <p className="m-0 text-[17px] font-bold text-[#0f172a]">Acme Corporation</p>
              <Badge label="Active" tone="green" />
            </div>
            <p className="m-0 mt-[3px] truncate text-[12px] text-[#64748b]">acme.com • San Francisco, CA, USA • 5,200 Employees • Software</p>
          </div>
        </div>
        <div className="bg-white p-[18px]">
          <p className="m-0 text-[12px] text-[#94a3b8]">Current Score</p>
          <div className="mt-[6px] flex items-baseline gap-[8px]">
            <span className="text-[26px] font-bold leading-none text-[#0f172a]">78</span>
            <span className="text-[13px] text-[#94a3b8]">/100</span>
            <Badge label="Good Fit" tone="green" />
          </div>
        </div>
        <div className="bg-white p-[18px]">
          <p className="m-0 text-[12px] text-[#94a3b8]">Score Trend (30 Days)</p>
          <p className="m-0 mt-[6px] text-[16px] font-bold text-[#16a34a]">↑ 8 pts</p>
          <p className="m-0 mt-[3px] text-[12px] text-[#94a3b8]">vs Apr 20, 2025</p>
        </div>
        <div className="bg-white p-[18px]">
          <p className="m-0 text-[12px] text-[#94a3b8]">Average Score (90 Days)</p>
          <p className="m-0 mt-[6px] text-[26px] font-bold leading-none text-[#0f172a]">72</p>
        </div>
        <div className="bg-white p-[18px]">
          <p className="m-0 text-[12px] text-[#94a3b8]">Last Updated</p>
          <p className="m-0 mt-[6px] text-[15px] font-bold text-[#0f172a]">May 20, 2025</p>
          <p className="m-0 mt-[3px] text-[12px] text-[#94a3b8]">10:30 AM IST</p>
        </div>
      </div>
    </div>
  );
}

const tabs = ["Score History", "Score Breakdown History", "Score Drivers History", "Events Timeline"];

function Tabs() {
  return (
    <div className="mt-[18px] flex gap-[28px] overflow-x-auto border-b border-[#e9edf5]">
      {tabs.map((tab, i) => (
        <button
          className={cn("-mb-px whitespace-nowrap border-b-2 pb-[14px] text-[14px] font-semibold transition", i === 0 ? "border-[#5b3df5] text-[#5b3df5]" : "border-transparent text-[#64748b] hover:text-[#334155]")}
          key={tab}
          onClick={() => {
            if (i === 0) {
              return;
            }
            window.location.href = "/score-breakdown";
          }}
          type="button"
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Score Over Time                                                     */
/* ------------------------------------------------------------------ */

const sotLabels = ["Apr 21", "Apr 24", "Apr 27", "Apr 30", "May 3", "May 6", "May 9", "May 12", "May 15", "May 18", "May 20"];
const sotValues = [55, 54, 52, 58, 61, 64, 72, 68, 74, 82, 78];
const sotEvents = ["#16a34a", "#ef4444", "#f97316", "#16a34a", "#3b82f6", "#f97316", "#16a34a", "#ef4444", "#3b82f6", "#16a34a", "#16a34a"];
const ranges = ["7D", "30D", "90D", "6M", "1Y", "All"];
const legend = [
  { label: "Positive Event", color: "#16a34a" },
  { label: "Negative Event", color: "#ef4444" },
  { label: "Model Update", color: "#3b82f6" },
  { label: "Manual Update", color: "#f97316" },
];

function ScoreChart() {
  const w = 700;
  const h = 320;
  const left = 34;
  const right = w - 14;
  const top = 16;
  const bottom = 250;
  const grid = [0, 25, 50, 75, 100];
  const xOf = (i: number) => left + (i * (right - left)) / (sotLabels.length - 1);
  const yOf = (v: number) => bottom - (v / 100) * (bottom - top);
  const pts = sotValues.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x} ${bottom} L ${pts[0].x} ${bottom} Z`;

  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="sh-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid.map((v) => (
        <g key={v}>
          <line stroke="#eef2f7" strokeWidth="1" x1={left} x2={right} y1={yOf(v)} y2={yOf(v)} />
          <text fill="#94a3b8" fontSize="10" textAnchor="end" x={left - 6} y={yOf(v) + 4}>{v}</text>
        </g>
      ))}
      {pts.map((p, i) => (
        <line key={`v${i}`} stroke="#e6e9f2" strokeDasharray="3 4" strokeWidth="1" x1={p.x} x2={p.x} y1={top} y2={bottom} />
      ))}
      <path d={area} fill="url(#sh-area)" />
      <path d={line} fill="none" stroke="#7c3aed" strokeWidth="2.5" />
      {pts.map((p, i) => (
        <circle cx={p.x} cy={p.y} fill="#ffffff" key={i} r="4" stroke={sotEvents[i]} strokeWidth="2.5" />
      ))}
      {sotLabels.map((label, i) => (
        <text fill="#94a3b8" fontSize="10" key={label} textAnchor={i === 0 ? "start" : i === sotLabels.length - 1 ? "end" : "middle"} x={xOf(i)} y={bottom + 24}>{label}</text>
      ))}
    </svg>
  );
}

function ScoreOverTime() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-[12px]">
        <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">Score Over Time <Info className="size-[14px] text-[#cbd5e1]" /></h2>
        <div className="flex items-center gap-[8px]">
          <div className="flex items-center gap-[2px] rounded-[10px] border border-[#e9edf5] bg-white p-[3px]">
            {ranges.map((r) => (
              <button className={cn("rounded-[7px] px-[12px] py-[5px] text-[12px] font-semibold transition", r === "30D" ? "bg-[#eef1ff] text-[#5b3df5]" : "text-[#64748b] hover:text-[#334155]")} key={r} type="button">{r}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative mt-[14px]">
        <ScoreChart />
        <div className="pointer-events-none absolute left-[50%] top-[34%] rounded-[10px] border border-[#eef1f6] bg-white px-[12px] py-[8px] shadow-[0px_8px_20px_rgba(15,23,42,0.1)]">
          <p className="m-0 text-[12px] font-semibold text-[#0f172a]">May 9, 2025</p>
          <p className="m-0 mt-[2px] text-[12px] text-[#64748b]">Score: <span className="font-bold text-[#0f172a]">72</span></p>
          <p className="m-0 mt-[2px] text-[11px] font-semibold text-[#16a34a]">↑ 8 pts vs May 8, 2025</p>
        </div>
      </div>

      <div className="mt-[12px] flex flex-wrap items-center justify-center gap-[20px]">
        {legend.map((l) => (
          <span className="flex items-center gap-[7px] text-[12px] font-medium text-[#475569]" key={l.label}>
            <span className="size-[9px] rounded-full" style={{ backgroundColor: l.color }} /> {l.label}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Score Change Log                                                    */
/* ------------------------------------------------------------------ */

type LogRow = {
  date: string;
  score: number;
  change: string;
  changePct: string;
  reason: string;
  eventType: string;
  eventTone: string;
  impact: string;
  source: string;
  dir: "up" | "down" | "flat";
};

const log: LogRow[] = [
  { date: "May 20, 2025", score: 78, change: "+2", changePct: "+2.6%", reason: "New funding round announced", eventType: "Positive", eventTone: "green", impact: "+2 pts", source: "Signal", dir: "up" },
  { date: "May 18, 2025", score: 76, change: "+4", changePct: "+5.6%", reason: "Expanded tech stack detected", eventType: "Positive", eventTone: "green", impact: "+4 pts", source: "Signal", dir: "up" },
  { date: "May 15, 2025", score: 72, change: "-3", changePct: "-4.0%", reason: "High employee churn detected", eventType: "Negative", eventTone: "red", impact: "-3 pts", source: "Signal", dir: "down" },
  { date: "May 12, 2025", score: 75, change: "+5", changePct: "+7.1%", reason: "Job posting spike (15+ roles)", eventType: "Positive", eventTone: "green", impact: "+5 pts", source: "Signal", dir: "up" },
  { date: "May 9, 2025", score: 70, change: "+6", changePct: "+9.4%", reason: "Intent surge: Product Research", eventType: "Positive", eventTone: "green", impact: "+6 pts", source: "Signal", dir: "up" },
  { date: "May 6, 2025", score: 64, change: "0", changePct: "0.0%", reason: "Model recalibration applied", eventType: "Model Update", eventTone: "blue", impact: "0 pts", source: "System", dir: "flat" },
  { date: "May 3, 2025", score: 64, change: "-2", changePct: "-3.0%", reason: "Reduced hiring activity", eventType: "Negative", eventTone: "red", impact: "-2 pts", source: "Signal", dir: "down" },
  { date: "Apr 30, 2025", score: 66, change: "+1", changePct: "+1.5%", reason: "New leadership hire", eventType: "Positive", eventTone: "green", impact: "+1 pt", source: "Signal", dir: "up" },
  { date: "Apr 27, 2025", score: 65, change: "-4", changePct: "-5.8%", reason: "Decline in web engagement", eventType: "Negative", eventTone: "red", impact: "-4 pts", source: "Signal", dir: "down" },
  { date: "Apr 25, 2025", score: 69, change: "-3", changePct: "-4.2%", reason: "Budget cut news detected", eventType: "Negative", eventTone: "red", impact: "-3 pts", source: "Signal", dir: "down" },
];

const logCols = "grid-cols-[1.1fr_0.6fr_0.7fr_0.8fr_minmax(0,2fr)_1fr_0.8fr_0.7fr]";

function changeColor(dir: string) {
  return dir === "up" ? "text-[#16a34a]" : dir === "down" ? "text-[#ef4444]" : "text-[#64748b]";
}

function ScoreChangeLog() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">Score Change Log <Info className="size-[14px] text-[#cbd5e1]" /></h2>

      <div className="mt-[14px] overflow-x-auto">
        <div className="min-w-[860px]">
          <div className={cn("grid gap-[12px] border-b border-[#eef1f6] pb-[10px] text-[12px] font-semibold text-[#94a3b8]", logCols)}>
            <span>Date</span><span>Score</span><span>Change</span><span>Change %</span><span>Reason / Trigger</span><span>Event Type</span><span>Impact</span><span>Source</span>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {log.map((r) => (
              <div className={cn("grid items-center gap-[12px] py-[12px] text-[13px]", logCols)} key={r.date}>
                <span className="font-medium text-[#334155]">{r.date}</span>
                <span className="font-semibold text-[#0f172a]">{r.score}</span>
                <span className={cn("font-semibold", changeColor(r.dir))}>{r.change}</span>
                <span className={cn("font-semibold", changeColor(r.dir))}>{r.changePct}</span>
                <span className="truncate text-[#334155]">{r.reason}</span>
                <span><Badge label={r.eventType} tone={r.eventTone} /></span>
                <span className={cn("font-semibold", changeColor(r.dir))}>{r.impact}</span>
                <span className="text-[#64748b]">{r.source}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-[16px] flex flex-wrap items-center justify-between gap-[12px]">
        <span className="text-[13px] text-[#64748b]">Showing 1 to 10 of 28 events</span>
        <div className="flex items-center gap-[6px]">
          <button aria-label="Previous page" className="flex size-[32px] items-center justify-center rounded-[9px] border border-[#e9edf5] bg-white text-[#475569]" type="button"><ChevronLeft className="size-[15px]" /></button>
          <button className="flex size-[32px] items-center justify-center rounded-[9px] bg-[#5b3df5] text-[13px] font-semibold text-white" type="button">1</button>
          <button className="flex size-[32px] items-center justify-center rounded-[9px] border border-[#e9edf5] bg-white text-[13px] font-semibold text-[#475569]" type="button">2</button>
          <button className="flex size-[32px] items-center justify-center rounded-[9px] border border-[#e9edf5] bg-white text-[13px] font-semibold text-[#475569]" type="button">3</button>
          <span className="px-[4px] text-[14px] text-[#94a3b8]">…</span>
          <button aria-label="Next page" className="flex size-[32px] items-center justify-center rounded-[9px] border border-[#e9edf5] bg-white text-[#475569]" type="button"><ChevronRight className="size-[15px]" /></button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Right rail                                                          */
/* ------------------------------------------------------------------ */

const summaryRows: { label: string; value: ReactValue; sub?: string; badge?: boolean; tone?: string; info?: boolean }[] = [
  { label: "Highest Score", value: "82", sub: "May 18, 2025" },
  { label: "Lowest Score", value: "61", sub: "Apr 25, 2025" },
  { label: "Score Change", value: "+8", sub: "Apr 20 – May 20, 2025", tone: "up" },
  { label: "Average Score", value: "72" },
  { label: "Volatility", value: "Low", info: true },
  { label: "Consistency", value: "Good", badge: true, tone: "green" },
];
type ReactValue = string;

function ScoreSummary() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">Score Summary (30 Days)</h2>
      <div className="mt-[14px] flex flex-col gap-[14px]">
        {summaryRows.map((r) => (
          <div className="flex items-center justify-between gap-[10px]" key={r.label}>
            <span className="flex items-center gap-[6px] text-[13px] text-[#64748b]">
              {r.label}
              {r.info && <Info className="size-[13px] text-[#cbd5e1]" />}
            </span>
            <span className="flex items-center gap-[10px] text-right">
              {r.badge ? (
                <Badge label={r.value} tone="green" />
              ) : (
                <span className={cn("text-[15px] font-bold", r.tone === "up" ? "text-[#16a34a]" : "text-[#0f172a]")}>{r.value}</span>
              )}
              {r.sub && <span className="text-[11px] text-[#94a3b8]">{r.sub}</span>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

const distribution = [
  { label: "80 - 100 (Excellent)", pct: "18%", value: 18, color: "#3b82f6" },
  { label: "60 - 79 (Good)", pct: "52%", value: 52, color: "#16a34a" },
  { label: "40 - 59 (Average)", pct: "20%", value: 20, color: "#f59e0b" },
  { label: "20 - 39 (Low)", pct: "8%", value: 8, color: "#ef4444" },
  { label: "0 - 19 (Very Low)", pct: "2%", value: 2, color: "#b91c1c" },
];

function ScoreDistribution() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 flex items-center gap-[8px] text-[15px] font-bold text-[#0f172a]">Score Distribution <span className="text-[12px] font-normal text-[#94a3b8]">(90 Days)</span> <Info className="size-[13px] text-[#cbd5e1]" /></h2>
      <div className="mt-[14px] flex items-center gap-[16px]">
        <div className="relative size-[108px] shrink-0">
          <Donut segments={distribution.map((d) => ({ value: d.value, color: d.color }))} size={108} thickness={16} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[18px] font-bold leading-none text-[#0f172a]">90</span>
            <span className="mt-[2px] text-[11px] text-[#94a3b8]">Days</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-[8px]">
          {distribution.map((d) => (
            <div className="flex items-center justify-between gap-[8px]" key={d.label}>
              <span className="flex min-w-0 items-center gap-[7px] text-[12px] text-[#334155]">
                <span className="size-[8px] shrink-0 rounded-full" style={{ backgroundColor: d.color }} /> <span className="truncate">{d.label}</span>
              </span>
              <span className="text-[12px] font-semibold text-[#0f172a]">{d.pct}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const drivers = [
  { label: "Intent Signals", pts: "+18 pts", value: 18, pos: true },
  { label: "Technographic Fit", pts: "+12 pts", value: 12, pos: true },
  { label: "Engagement Signals", pts: "+8 pts", value: 8, pos: true },
  { label: "Firmographic Fit", pts: "+5 pts", value: 5, pos: true },
  { label: "Negative Signals", pts: "-15 pts", value: 15, pos: false },
];

function ScoreDrivers() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 flex items-center gap-[8px] text-[15px] font-bold text-[#0f172a]">Score Change Drivers <span className="text-[12px] font-normal text-[#94a3b8]">(90 Days)</span> <Info className="size-[13px] text-[#cbd5e1]" /></h2>
      <div className="mt-[14px] flex flex-col gap-[13px]">
        {drivers.map((d) => (
          <div key={d.label}>
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-medium text-[#334155]">{d.label}</span>
              <span className={cn("font-bold", d.pos ? "text-[#16a34a]" : "text-[#ef4444]")}>{d.pts}</span>
            </div>
            <div className="mt-[6px] h-[6px] w-full rounded-full bg-[#eef1f6]">
              <span className="block h-full rounded-full" style={{ width: `${(d.value / 18) * 100}%`, backgroundColor: d.pos ? "#16a34a" : "#ef4444" }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Insights() {
  return (
    <section className="rounded-[16px] border border-[#eee9ff] bg-[#faf8ff] p-[20px]">
      <h2 className="m-0 flex items-center gap-[8px] text-[15px] font-bold text-[#0f172a]"><Lightbulb className="size-[16px] text-[#f59e0b]" /> Insights</h2>
      <p className="m-0 mt-[12px] text-[13px] leading-[19px] text-[#475569]">
        Score improved by 8 points in the last 30 days primarily due to increased intent activity and technology expansion.
      </p>
      <button className="mt-[14px] flex items-center gap-[6px] text-[13px] font-semibold text-[#5b3df5]" type="button">
        View full insights <ChevronRight className="size-[14px]" />
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function ScoreHistoryPage() {
  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Score Breakdown" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar searchPlaceholder="Search companies, triggers, executives..." showDetection={false} />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          <Header />
          <Tabs />

          <div className="mt-[22px] grid grid-cols-1 gap-[20px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex flex-col gap-[20px]">
              <ScoreOverTime />
              <ScoreChangeLog />
            </div>
            <div className="flex flex-col gap-[20px]">
              <ScoreSummary />
              <ScoreDistribution />
              <ScoreDrivers />
              <Insights />
            </div>
          </div>

          <div className="mt-[20px] flex flex-col gap-[8px] text-[12px] text-[#94a3b8] sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-[6px]"><span className="size-[7px] rounded-full bg-[#16a34a]" /> Data refreshed 10 minutes ago</span>
            <span>All times shown in IST (India Standard Time)</span>
            <span>Data Source: XSparks Intelligence Engine</span>
          </div>
        </main>
      </div>
    </div>
  );
}
