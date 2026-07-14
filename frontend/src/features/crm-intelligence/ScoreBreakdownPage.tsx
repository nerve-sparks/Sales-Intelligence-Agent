import {
  ChevronDown,
  ChevronRight,
  Info,
  Plus,
  Share2,
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
  orange: "bg-[#fff1e3] text-[#f97316]",
  red: "bg-[#fee2e2] text-[#ef4444]",
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
            <span className="font-semibold text-[#5b3df5]">Score Breakdown</span>
            <ChevronRight className="size-[14px] text-[#cbd5e1]" />
            <span className="font-semibold text-[#0f172a]">Acme Corporation</span>
          </nav>
          <h1 className="m-0 mt-[10px] text-[26px] font-bold text-[#0f172a]">Score Breakdown</h1>
          <p className="m-0 mt-[6px] text-[15px] text-[#64748b]">
            Detailed breakdown of Acme Corporation's score across all dimensions and signals.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-[10px]">
          <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[10px] text-[14px] font-semibold text-[#334155]" type="button">
            <Share2 className="size-[16px]" /> Share
          </button>
          <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[10px] text-[14px] font-semibold text-[#334155]" type="button">
            <Upload className="size-[16px]" /> Export PDF
          </button>
          <button className="flex items-center gap-[8px] rounded-[10px] bg-[#5b3df5] px-[16px] py-[10px] text-[14px] font-semibold text-white shadow-[0px_10px_20px_-6px_rgba(91,61,245,0.5)]" type="button">
            <Plus className="size-[17px]" /> Create Opportunity
          </button>
        </div>
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-px overflow-hidden rounded-[16px] border border-[#eef1f6] bg-[#eef1f6] lg:grid-cols-[minmax(0,1.6fr)_1fr_1fr_1fr]">
        <div className="flex items-center gap-[14px] bg-white p-[18px]">
          <span className="flex size-[48px] shrink-0 items-center justify-center rounded-[12px] bg-[#e6f0ff] text-[15px] font-bold text-[#2563eb]">AC</span>
          <div className="min-w-0">
            <div className="flex items-center gap-[8px]">
              <p className="m-0 text-[17px] font-bold text-[#0f172a]">Acme Corporation</p>
              <Badge label="Active" tone="green" />
            </div>
            <p className="m-0 mt-[3px] truncate text-[12px] text-[#64748b]">
              acme.com • San Francisco, CA, USA • 5,200 Employees • Software
            </p>
          </div>
        </div>
        <div className="bg-white p-[18px]">
          <p className="m-0 text-[12px] text-[#94a3b8]">Overall Score</p>
          <div className="mt-[6px] flex items-baseline gap-[8px]">
            <span className="text-[26px] font-bold leading-none text-[#0f172a]">78</span>
            <span className="text-[13px] text-[#94a3b8]">/100</span>
            <Badge label="Good Fit" tone="green" />
          </div>
        </div>
        <div className="bg-white p-[18px]">
          <p className="m-0 text-[12px] text-[#94a3b8]">Score Trend</p>
          <p className="m-0 mt-[6px] text-[16px] font-bold text-[#16a34a]">↑ +8 pts</p>
          <p className="m-0 mt-[3px] text-[12px] text-[#94a3b8]">vs last 30 days</p>
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

const tabs = ["Score Breakdown", "Score History", "Signals (28)", "Peer Comparison", "Model Insights"];

function Tabs() {
  return (
    <div className="mt-[18px] flex gap-[28px] overflow-x-auto border-b border-[#e9edf5]">
      {tabs.map((tab, i) => (
        <button
          className={cn("-mb-px whitespace-nowrap border-b-2 pb-[14px] text-[14px] font-semibold transition", i === 0 ? "border-[#5b3df5] text-[#5b3df5]" : "border-transparent text-[#64748b] hover:text-[#334155]")}
          key={tab}
          onClick={() => {
            if (tab === "Score History") {
              window.location.href = "/score-history";
            }
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
/* Score by Dimension                                                  */
/* ------------------------------------------------------------------ */

const dimensions = [
  { name: "Firmographic Fit", score: 85, weight: "25%", weighted: "21.3", impact: "High", impTone: "green", color: "#2563eb", val: 21.3 },
  { name: "Intent Signals", score: 72, weight: "20%", weighted: "14.4", impact: "High", impTone: "green", color: "#16a34a", val: 14.4 },
  { name: "Engagement Signals", score: 68, weight: "15%", weighted: "10.2", impact: "Medium", impTone: "orange", color: "#7c3aed", val: 10.2 },
  { name: "Technographic Fit", score: 80, weight: "15%", weighted: "12.0", impact: "High", impTone: "green", color: "#f59e0b", val: 12.0 },
  { name: "Financial Health", score: 75, weight: "10%", weighted: "7.5", impact: "Medium", impTone: "orange", color: "#f97316", val: 7.5 },
  { name: "Relationship Strength", score: 62, weight: "10%", weighted: "6.2", impact: "Low", impTone: "red", color: "#ef4444", val: 6.2 },
  { name: "Negative Signals", score: 40, weight: "5%", weighted: "2.0", impact: "Low", impTone: "red", color: "#94a3b8", val: 2.0 },
];

const dimCols = "grid-cols-[minmax(0,1.6fr)_0.8fr_0.9fr_1fr_0.7fr]";

function ScoreByDimension() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-[12px]">
        <div>
          <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">Score by Dimension <Info className="size-[14px] text-[#cbd5e1]" /></h2>
          <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">Breakdown of score contribution by evaluation dimensions.</p>
        </div>
        <button className="rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[8px] text-[13px] font-semibold text-[#334155]" type="button">View Model</button>
      </div>

      <div className="mt-[16px] flex flex-col items-center gap-[24px] xl:flex-row xl:items-start">
        <div className="relative size-[220px] shrink-0">
          <Donut segments={dimensions.map((d) => ({ value: d.val, color: d.color }))} size={220} thickness={30} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[34px] font-bold leading-none text-[#0f172a]">78</span>
            <span className="mt-[3px] text-[13px] text-[#94a3b8]">/100</span>
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="min-w-[520px]">
            <div className={cn("grid gap-[12px] border-b border-[#eef1f6] pb-[10px] text-[12px] font-semibold text-[#94a3b8]", dimCols)}>
              <span>Dimension</span>
              <span>Score</span>
              <span>Weightage</span>
              <span>Weighted Score</span>
              <span>Impact</span>
            </div>
            <div className="divide-y divide-[#f1f5f9]">
              {dimensions.map((d) => (
                <div className={cn("grid items-center gap-[12px] py-[11px] text-[13px]", dimCols)} key={d.name}>
                  <span className="flex items-center gap-[10px] font-semibold text-[#0f172a]">
                    <span className="size-[9px] shrink-0 rounded-full" style={{ backgroundColor: d.color }} /> {d.name}
                  </span>
                  <span className="text-[#334155]">{d.score}<span className="text-[#94a3b8]">/100</span></span>
                  <span className="text-[#334155]">{d.weight}</span>
                  <span className="font-semibold text-[#0f172a]">{d.weighted}</span>
                  <span><Badge label={d.impact} tone={d.impTone} /></span>
                </div>
              ))}
              <div className={cn("grid items-center gap-[12px] pt-[12px] text-[13px] font-bold text-[#0f172a]", dimCols)}>
                <span>Total</span>
                <span />
                <span>100%</span>
                <span>73.6 <span className="font-normal text-[#94a3b8]">= 78/100</span></span>
                <span />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Top Signals                                                         */
/* ------------------------------------------------------------------ */

const signals = [
  { n: "A", name: "Visited Pricing Page", cat: "Engagement", pts: "+12 pts", pos: true, strength: 100 },
  { n: "2", name: "Downloaded ROI Calculator", cat: "Engagement", pts: "+10 pts", pos: true, strength: 84 },
  { n: "3", name: "Hiring: Revenue Operations Manager", cat: "Intent", pts: "+8 pts", pos: true, strength: 68 },
  { n: "4", name: "Using: Salesforce + Segment", cat: "Technographic", pts: "+6 pts", pos: true, strength: 52, amber: true },
  { n: "5", name: "Attended Webinar (3)", cat: "Engagement", pts: "+5 pts", pos: true, strength: 44, amber: true },
  { n: "6", name: "Low hiring in last 6 months", cat: "Intent", pts: "-8 pts", pos: false, strength: 68 },
  { n: "7", name: "High employee churn (18%)", cat: "Financial", pts: "-6 pts", pos: false, strength: 52 },
  { n: "8", name: "No sales engagement yet", cat: "Engagement", pts: "-5 pts", pos: false, strength: 44 },
];

const sigCols = "grid-cols-[minmax(0,1.8fr)_1fr_0.7fr_0.9fr]";

function TopSignals() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">Top Signals <Info className="size-[14px] text-[#cbd5e1]" /></h2>

      <div className="mt-[14px] overflow-x-auto">
        <div className="min-w-[520px]">
          <div className={cn("grid gap-[12px] border-b border-[#eef1f6] pb-[10px] text-[12px] font-semibold text-[#94a3b8]", sigCols)}>
            <span>Signal</span>
            <span>Category</span>
            <span>Impact</span>
            <span>Strength</span>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {signals.map((s) => {
              const barColor = s.pos ? (s.amber ? "#f59e0b" : "#16a34a") : "#ef4444";
              return (
                <div className={cn("grid items-center gap-[12px] py-[11px] text-[13px]", sigCols)} key={s.name}>
                  <span className="flex min-w-0 items-center gap-[10px]">
                    <span className={cn("flex size-[24px] shrink-0 items-center justify-center rounded-[6px] text-[11px] font-bold", s.pos ? "bg-[#e7f8ef] text-[#16a34a]" : "bg-[#fee2e2] text-[#ef4444]")}>{s.n}</span>
                    <span className="truncate font-medium text-[#334155]">{s.name}</span>
                  </span>
                  <span className="text-[#64748b]">{s.cat}</span>
                  <span className={cn("font-bold", s.pos ? "text-[#16a34a]" : "text-[#ef4444]")}>{s.pts}</span>
                  <span className="h-[6px] w-full rounded-full bg-[#eef1f6]">
                    <span className="block h-full rounded-full" style={{ width: `${s.strength}%`, backgroundColor: barColor }} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <button className="mt-[16px] flex items-center gap-[6px] text-[13px] font-semibold text-[#5b3df5]" type="button">
        View all signals <ChevronRight className="size-[14px]" />
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Score History                                                       */
/* ------------------------------------------------------------------ */

const histLabels = ["Feb 20", "Mar 6", "Mar 20", "Apr 3", "Apr 17", "May 1", "May 20"];
const histValues = [50, 55, 55, 62, 70, 77, 78];

function HistoryChart() {
  const w = 560;
  const h = 260;
  const left = 30;
  const right = w - 14;
  const top = 16;
  const bottom = 210;
  const grid = [0, 25, 50, 75, 100];
  const xOf = (i: number) => left + (i * (right - left)) / (histLabels.length - 1);
  const yOf = (v: number) => bottom - (v / 100) * (bottom - top);
  const pts = histValues.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x} ${bottom} L ${pts[0].x} ${bottom} Z`;

  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="hist-area" x1="0" x2="0" y1="0" y2="1">
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
      <path d={area} fill="url(#hist-area)" />
      <path d={line} fill="none" stroke="#7c3aed" strokeWidth="2.5" />
      {pts.map((p, i) => <circle cx={p.x} cy={p.y} fill="#7c3aed" key={i} r="3.4" />)}
      {histLabels.map((label, i) => (
        <text fill="#94a3b8" fontSize="10" key={label} textAnchor={i === 0 ? "start" : i === histLabels.length - 1 ? "end" : "middle"} x={xOf(i)} y={bottom + 24}>{label}</text>
      ))}
    </svg>
  );
}

function ScoreHistory() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">Score History <Info className="size-[14px] text-[#cbd5e1]" /></h2>
        <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[12px] py-[7px] text-[13px] font-semibold text-[#475569]" type="button">
          Last 90 Days <ChevronDown className="size-[13px] text-[#94a3b8]" />
        </button>
      </div>
      <div className="relative mt-[12px]">
        <HistoryChart />
        <div className="pointer-events-none absolute right-[10%] top-[24%] rounded-[10px] border border-[#eef1f6] bg-white px-[12px] py-[8px] shadow-[0px_8px_20px_rgba(15,23,42,0.1)]">
          <p className="m-0 text-[12px] font-semibold text-[#0f172a]">May 20, 2025</p>
          <p className="m-0 mt-[2px] text-[12px] text-[#64748b]">Score: <span className="font-bold text-[#0f172a]">78</span></p>
          <p className="m-0 mt-[2px] text-[11px] font-semibold text-[#16a34a]">↑ +8 pts vs Apr 20, 2025</p>
        </div>
      </div>
      <button className="mt-[10px] flex items-center gap-[6px] text-[13px] font-semibold text-[#5b3df5]" type="button">
        View full score history <ChevronRight className="size-[14px]" />
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function ScoreBreakdownPage() {
  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Score Breakdown" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar searchPlaceholder="Search companies, triggers, executives..." showDetection={false} />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          <Header />
          <Tabs />

          <div className="mt-[22px]">
            <ScoreByDimension />
          </div>

          <div className="mt-[20px] grid grid-cols-1 gap-[20px] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <TopSignals />
            <ScoreHistory />
          </div>
        </main>
      </div>
    </div>
  );
}
