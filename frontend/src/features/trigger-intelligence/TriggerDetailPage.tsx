import {
  Activity,
  Atom,
  Braces,
  Building2,
  CaseSensitive,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  Flame,
  Layers,
  ListChecks,
  MoreVertical,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Rocket,
  Share2,
  Snowflake,
  Tag,
  Triangle,
  User,
  Zap,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Delta, Donut, UpTriangle, smoothPath } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

type IconType = ComponentType<{ className?: string }>;

function LogoSquare({
  icon: Icon,
  text,
  bg,
  color,
  size = 40,
  radius = 10,
}: {
  icon?: IconType;
  text?: string;
  bg: string;
  color: string;
  size?: number;
  radius?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center text-[12px] font-bold"
      style={{ backgroundColor: bg, color, width: size, height: size, borderRadius: radius }}
    >
      {Icon ? <Icon className="size-[19px]" /> : text}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-[8px] bg-[#efeafe] px-[10px] py-[4px] text-[13px] font-bold text-[#6d28d9]">
      {score}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Header + tabs                                                       */
/* ------------------------------------------------------------------ */

function DetailHeader() {
  return (
    <div className="flex flex-col gap-[18px] xl:flex-row xl:items-start xl:justify-between">
      <div className="flex items-start gap-[18px]">
        <LogoSquare bg="#f3e9ff" color="#7c3aed" icon={Rocket} radius={14} size={60} />
        <div>
          <div className="flex flex-wrap items-center gap-[12px]">
            <h1 className="m-0 text-[24px] font-bold text-[#0f172a]">
              Funding round announced
            </h1>
            <span className="rounded-[7px] bg-[#f3e9ff] px-[10px] py-[4px] text-[12px] font-semibold text-[#7c3aed]">
              High Intent
            </span>
          </div>
          <p className="m-0 mt-[6px] text-[14px] text-[#64748b]">
            Detect companies that have announced a new funding round.
          </p>
          <p className="m-0 mt-[8px] flex flex-wrap items-center gap-x-[8px] gap-y-[4px] text-[13px] text-[#94a3b8]">
            <span>
              Category:{" "}
              <span className="font-medium text-[#475569]">Funding & Investment</span>
            </span>
            <span>•</span>
            <span>
              Intent Level: <span className="font-semibold text-[#7c3aed]">High</span>
            </span>
            <span>•</span>
            <span>Created: May 10, 2025</span>
            <span>•</span>
            <span>Last Modified: May 20, 2025</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-[10px]">
        <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-semibold text-[#334155]" type="button">
          <Share2 className="size-[16px]" />
          Share
        </button>
        <button className="rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-semibold text-[#334155]" type="button">
          Save as Template
        </button>
        <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-semibold text-[#334155]" type="button">
          <Pencil className="size-[16px] text-[#5b3df5]" />
          Edit Trigger
        </button>
        <button className="flex items-center gap-[8px] rounded-[10px] bg-[#fa5a1e] px-[18px] py-[10px] text-[14px] font-semibold text-white shadow-[0px_10px_20px_-6px_rgba(250,90,30,0.5)]" type="button">
          <Rocket className="size-[16px]" />
          Run Trigger
        </button>
        <button aria-label="More actions" className="flex size-[42px] items-center justify-center rounded-[10px] border border-[#e9edf5] bg-white text-[#64748b]" type="button">
          <MoreVertical className="size-[17px]" />
        </button>
      </div>
    </div>
  );
}

const tabs = [
  "Overview",
  "Signals (156)",
  "Matched Companies (126)",
  "Conditions",
  "Signal Sources",
  "Activity Log",
  "Performance",
];

function DetailTabs() {
  return (
    <div className="mt-[18px] flex gap-[28px] overflow-x-auto border-b border-[#e9edf5]">
      {tabs.map((tab, index) => {
        const active = index === 0;
        return (
          <button
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 pb-[14px] text-[14px] font-semibold transition",
              active ? "border-[#5b3df5] text-[#5b3df5]" : "border-transparent text-[#64748b] hover:text-[#334155]",
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
/* Overview + intent distribution                                      */
/* ------------------------------------------------------------------ */

function OverviewItem({
  icon: Icon,
  color,
  label,
  children,
}: {
  icon: IconType;
  color: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-[12px]">
      <span className="flex size-[32px] shrink-0 items-center justify-center rounded-[8px] bg-[#f1f5f9]" style={{ color }}>
        <Icon className="size-[16px]" />
      </span>
      <div className="min-w-0">
        <p className="m-0 text-[11px] text-[#94a3b8]">{label}</p>
        <div className="mt-[3px] text-[13px] font-semibold text-[#334155]">{children}</div>
      </div>
    </div>
  );
}

const intentDist = [
  { label: "90 - 100 (High)", value: 72, pct: "46.2%", color: "#7c3aed" },
  { label: "70 - 89 (Medium)", value: 58, pct: "37.2%", color: "#f97316" },
  { label: "50 - 69 (Low)", value: 18, pct: "11.5%", color: "#2563eb" },
  { label: "< 50 (Very Low)", value: 8, pct: "5.1%", color: "#cbd5e1" },
];

function OverviewCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="grid grid-cols-1 gap-[28px] lg:grid-cols-[1.25fr_1fr]">
        <div>
          <h2 className="m-0 text-[17px] font-bold text-[#0f172a]">Trigger Overview</h2>
          <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">
            Key information about this trigger and its configuration.
          </p>

          <div className="mt-[18px] grid grid-cols-1 gap-x-[24px] gap-y-[18px] sm:grid-cols-2">
            <div className="flex flex-col gap-[18px]">
              <OverviewItem color="#7c3aed" icon={Tag} label="Category">
                Funding & Investment
              </OverviewItem>
              <OverviewItem color="#f97316" icon={Flame} label="Intent Level">
                <span className="rounded-[6px] bg-[#f3e9ff] px-[8px] py-[2px] text-[12px] font-semibold text-[#7c3aed]">
                  High
                </span>
              </OverviewItem>
              <OverviewItem color="#7c3aed" icon={Pencil} label="Description">
                <span className="font-normal text-[#475569]">
                  Detect companies that have announced a new funding round through press
                  releases or news.
                </span>
              </OverviewItem>
              <OverviewItem color="#2563eb" icon={User} label="Created By">
                Arjun Kumar
                <span className="mt-[2px] block text-[12px] font-normal text-[#94a3b8]">
                  May 10, 2025
                </span>
              </OverviewItem>
              <OverviewItem color="#64748b" icon={Clock} label="Last Modified">
                <span className="font-normal text-[#475569]">May 20, 2025 10:30 AM</span>
              </OverviewItem>
            </div>

            <div className="flex flex-col gap-[18px]">
              <OverviewItem color="#7c3aed" icon={Braces} label="Logic">
                <span className="mt-[2px] block rounded-[8px] bg-[#f8fafc] px-[10px] py-[8px] text-[12px] font-medium leading-[17px] text-[#475569]">
                  (Keywords AND Funding Details AND Company Filter) AND Intent Score
                </span>
              </OverviewItem>
              <OverviewItem color="#2563eb" icon={ListChecks} label="Conditions">
                3 Conditions
              </OverviewItem>
              <OverviewItem color="#16a34a" icon={Radio} label="Signal Sources">
                All Sources
              </OverviewItem>
              <OverviewItem color="#f97316" icon={Building2} label="Coverage">
                18.6K companies
              </OverviewItem>
              <OverviewItem color="#06b6d4" icon={Activity} label="Estimated Daily Signals">
                120 – 180
              </OverviewItem>
            </div>
          </div>
        </div>

        <div>
          <h2 className="m-0 text-[17px] font-bold text-[#0f172a]">
            Intent Score Distribution
          </h2>
          <div className="mt-[16px] flex flex-col items-center gap-[22px] sm:flex-row">
            <div className="relative size-[150px] shrink-0">
              <Donut
                segments={intentDist.map((s) => ({ value: s.value, color: s.color }))}
                size={150}
                thickness={22}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[22px] font-bold leading-none text-[#0f172a]">156</span>
                <span className="mt-[3px] text-[11px] text-[#64748b]">Total Signals</span>
              </div>
            </div>
            <div className="flex w-full flex-1 flex-col gap-[12px]">
              {intentDist.map((s) => (
                <div className="flex items-center justify-between gap-[10px]" key={s.label}>
                  <span className="flex items-center gap-[8px]">
                    <span className="size-[9px] rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-[12px] font-medium text-[#334155]">{s.label}</span>
                  </span>
                  <span className="whitespace-nowrap text-[12px] text-[#94a3b8]">
                    <span className="font-semibold text-[#0f172a]">{s.value}</span> ({s.pct})
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-[18px] flex items-center justify-between rounded-[10px] bg-[#f8fafc] px-[16px] py-[12px]">
            <span className="text-[13px] font-semibold text-[#334155]">
              Average Intent Score
            </span>
            <span className="flex items-center gap-[10px]">
              <span className="text-[18px] font-bold text-[#0f172a]">82</span>
              <span className="flex items-center gap-[6px] text-[12px] text-[#94a3b8]">
                <Delta value="12%" /> vs last 7 days
              </span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Trigger conditions                                                  */
/* ------------------------------------------------------------------ */

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="m-0 text-[11px] text-[#94a3b8]">{label}</p>
      <p className="m-0 mt-[2px] text-[13px] font-semibold text-[#0f172a]">{value}</p>
    </div>
  );
}

function ConditionShell({
  icon: Icon,
  color,
  bg,
  title,
  subtitle,
  weight,
  children,
}: {
  icon: IconType;
  color: string;
  bg: string;
  title: string;
  subtitle: string;
  weight: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-[16px] rounded-[12px] border border-[#eef1f6] p-[16px]">
      <div className="flex w-[210px] shrink-0 items-center gap-[12px]">
        <LogoSquare bg={bg} color={color} icon={Icon} radius={9} size={38} />
        <div className="min-w-0">
          <p className="m-0 text-[14px] font-bold text-[#0f172a]">{title}</p>
          <p className="m-0 text-[12px] text-[#94a3b8]">{subtitle}</p>
        </div>
      </div>
      {children}
      <div className="ml-auto flex items-center gap-[20px]">
        <Field label="Weight" value={weight} />
        <button aria-label="Condition actions" className="flex size-[32px] items-center justify-center rounded-[8px] border border-[#e9edf5] text-[#64748b]" type="button">
          <MoreVertical className="size-[16px]" />
        </button>
      </div>
    </div>
  );
}

function AndConnector() {
  return (
    <div className="flex items-center gap-[10px] py-[2px] pl-[8px]">
      <span className="rounded-[6px] bg-[#ede9fe] px-[10px] py-[3px] text-[11px] font-bold text-[#7c3aed]">
        AND
      </span>
      <span className="h-px flex-1 bg-[#eef1f6]" />
    </div>
  );
}

function TriggerConditionsCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-[12px]">
        <div>
          <h2 className="m-0 text-[17px] font-bold text-[#0f172a]">Trigger Conditions</h2>
          <p className="m-0 mt-[3px] text-[13px] text-[#64748b]">3 conditions configured</p>
        </div>
        <span className="rounded-[7px] bg-[#eef1ff] px-[10px] py-[4px] text-[12px] font-semibold text-[#5b3df5]">
          AND Logic
        </span>
      </div>

      <div className="mt-[16px] flex flex-col gap-[10px]">
        <ConditionShell bg="#f3e9ff" color="#7c3aed" icon={CaseSensitive} subtitle="Contains any of these keywords" title="Keywords Match" weight="40%">
          <div className="flex flex-1 flex-wrap items-center gap-[6px]">
            {["funding", "raised", "investment"].map((k) => (
              <span className="rounded-[6px] bg-[#f3e9ff] px-[8px] py-[3px] text-[12px] font-medium text-[#7c3aed]" key={k}>
                {k}
              </span>
            ))}
            <span className="text-[12px] font-medium text-[#94a3b8]">+12 more</span>
          </div>
          <Field label="Case Insensitive" value="Yes" />
        </ConditionShell>

        <AndConnector />

        <ConditionShell bg="#e7f8ef" color="#16a34a" icon={DollarSign} subtitle="Funding amount greater than $1M" title="Funding Details" weight="35%">
          <div className="flex flex-1 items-center gap-[36px]">
            <Field label="Operator" value="Greater than" />
            <Field label="Amount" value="$1,000,000" />
          </div>
        </ConditionShell>

        <AndConnector />

        <ConditionShell bg="#e6f0ff" color="#2563eb" icon={Building2} subtitle="Company HQ in target regions" title="Company Filter" weight="25%">
          <div className="flex-1">
            <Field label="Regions" value="United States, Canada, India, UK" />
          </div>
        </ConditionShell>
      </div>

      <div className="mt-[16px] flex items-center justify-between">
        <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[9px] text-[13px] font-semibold text-[#334155]" type="button">
          <Plus className="size-[15px]" />
          Add Condition
        </button>
        <span className="text-[13px] text-[#64748b]">
          Total Weight: <span className="font-bold text-[#16a34a]">100%</span>
        </span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Recent signals                                                      */
/* ------------------------------------------------------------------ */

const recentSignals = [
  {
    logo: { icon: Triangle, bg: "#0f172a", color: "#ffffff" },
    company: "Acme Corp",
    domain: "acmecorp.com",
    headline: "Acme Corp raises $25M in Series B funding led by Sequoia Capital",
    tags: [
      { label: "Funding", tone: "purple" },
      { label: "Press Release", tone: "gray" },
    ],
    source: "TechCrunch",
    detected: "8m ago",
    score: 96,
  },
  {
    logo: { icon: Layers, bg: "#fdecec", color: "#ef4444" },
    company: "Databricks",
    domain: "databricks.com",
    headline: "Databricks closes $1.5B Series J funding round",
    tags: [
      { label: "Funding", tone: "purple" },
      { label: "News", tone: "gray" },
    ],
    source: "Business Wire",
    detected: "15m ago",
    score: 94,
  },
  {
    logo: { icon: Snowflake, bg: "#eaf6fd", color: "#29b5e8" },
    company: "Snowflake",
    domain: "snowflake.com",
    headline: "Snowflake announces $300M strategic investment",
    tags: [
      { label: "Investment", tone: "blue" },
      { label: "Press Release", tone: "gray" },
    ],
    source: "PR Newswire",
    detected: "22m ago",
    score: 93,
  },
];

const tagTones: Record<string, string> = {
  purple: "bg-[#f3e9ff] text-[#7c3aed]",
  gray: "bg-[#f1f5f9] text-[#64748b]",
  blue: "bg-[#e6f0ff] text-[#2563eb]",
};

const signalColumns =
  "grid-cols-[minmax(0,1.1fr)_minmax(0,2.2fr)_1fr_0.8fr_0.7fr]";

function RecentSignalsCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[17px] font-bold text-[#0f172a]">Recent Signals</h2>
      <p className="m-0 mt-[3px] text-[13px] text-[#64748b]">
        Latest signals generated by this trigger
      </p>

      <div className="mt-[16px] overflow-x-auto">
        <div className="min-w-[820px]">
          <div className={cn("grid gap-[16px] border-b border-[#eef1f6] pb-[10px] text-[12px] font-medium text-[#94a3b8]", signalColumns)}>
            <span>Company</span>
            <span>Headline</span>
            <span>Source</span>
            <span>Detected</span>
            <span>Intent Score</span>
          </div>

          <div className="divide-y divide-[#f1f5f9]">
            {recentSignals.map((s) => (
              <div className={cn("grid items-center gap-[16px] py-[14px]", signalColumns)} key={s.company}>
                <div className="flex min-w-0 items-center gap-[10px]">
                  <LogoSquare bg={s.logo.bg} color={s.logo.color} icon={s.logo.icon} radius={9} size={36} />
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[13px] font-bold text-[#0f172a]">{s.company}</p>
                    <p className="m-0 truncate text-[12px] text-[#94a3b8]">{s.domain}</p>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="m-0 text-[13px] font-medium text-[#334155]">{s.headline}</p>
                  <div className="mt-[6px] flex flex-wrap gap-[6px]">
                    {s.tags.map((t) => (
                      <span className={cn("rounded-[6px] px-[8px] py-[2px] text-[11px] font-semibold", tagTones[t.tone])} key={t.label}>
                        {t.label}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-[13px] text-[#64748b]">{s.source}</span>
                <span className="text-[13px] text-[#64748b]">{s.detected}</span>
                <span><ScoreBadge score={s.score} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-[14px] flex justify-end">
        <button className="flex items-center gap-[7px] text-[13px] font-semibold text-[#5b3df5]" type="button">
          View All Signals
          <ChevronRight className="size-[15px]" />
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Right rail                                                          */
/* ------------------------------------------------------------------ */

const perfValues = [120, 150, 135, 175, 160, 200, 185, 225, 205, 245, 225, 255, 260];
const perfTicks = [
  { i: 0, label: "Apr 21" },
  { i: 3, label: "Apr 28" },
  { i: 6, label: "May 5" },
  { i: 9, label: "May 12" },
  { i: 12, label: "May 19" },
];

function PerfChart() {
  const w = 380;
  const h = 180;
  const left = 30;
  const right = w - 10;
  const top = 12;
  const bottom = 148;
  const yMax = 300;
  const grid = [100, 200, 300];
  const xOf = (i: number) => left + (i * (right - left)) / (perfValues.length - 1);
  const yOf = (v: number) => bottom - (v / yMax) * (bottom - top);
  const pts = perfValues.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x} ${bottom} L ${pts[0].x} ${bottom} Z`;

  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="perf-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid.map((v) => (
        <g key={v}>
          <line stroke="#eef2f7" strokeWidth="1" x1={left} x2={right} y1={yOf(v)} y2={yOf(v)} />
          <text fill="#94a3b8" fontSize="10" textAnchor="end" x={left - 6} y={yOf(v) + 4}>
            {v}
          </text>
        </g>
      ))}
      <path d={area} fill="url(#perf-area)" />
      <path d={line} fill="none" stroke="#7c3aed" strokeLinecap="round" strokeWidth="2.5" />
      {pts.map((p, i) => (
        <circle cx={p.x} cy={p.y} fill="#7c3aed" key={i} r="2.6" />
      ))}
      {perfTicks.map((t) => (
        <text fill="#94a3b8" fontSize="10" key={t.label} textAnchor="middle" x={xOf(t.i)} y={bottom + 20}>
          {t.label}
        </text>
      ))}
    </svg>
  );
}

function PerfStat({ label, value, delta, sub }: { label: string; value: string; delta?: string; sub?: string }) {
  return (
    <div>
      <p className="m-0 text-[12px] text-[#94a3b8]">{label}</p>
      <p className="m-0 mt-[3px] text-[18px] font-bold leading-none text-[#0f172a]">{value}</p>
      {delta && (
        <p className="m-0 mt-[5px] flex items-center gap-[4px] text-[11px] font-semibold text-[#16a34a]">
          <UpTriangle className="size-[8px]" />
          {delta}
        </p>
      )}
      {sub && <p className="m-0 mt-[5px] text-[11px] text-[#94a3b8]">{sub}</p>}
    </div>
  );
}

function TriggerPerformanceCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">Trigger Performance (30 Days)</h2>
        <button className="text-[12px] font-semibold text-[#5b3df5]" type="button">View Analytics</button>
      </div>
      <div className="mt-[16px] grid grid-cols-3 gap-[12px]">
        <PerfStat delta="32.7%" label="Signals Generated" value="548" />
        <PerfStat delta="28.4%" label="Companies Matched" value="412" />
        <PerfStat delta="12.1%" label="Avg. Intent Score" value="85" />
      </div>
      <div className="mt-[18px] grid grid-cols-3 gap-[12px]">
        <PerfStat label="Precision" value="94.2%" />
        <PerfStat label="Coverage" sub="companies" value="18.6K" />
        <PerfStat label="Signal Velocity" value="18.3 / day" />
      </div>
      <div className="mt-[16px]">
        <PerfChart />
      </div>
    </section>
  );
}

const matchedCompanies = [
  { logo: { icon: Triangle, bg: "#0f172a", color: "#ffffff" }, name: "Acme Corp", sub: "Series B funding round announced", score: 96 },
  { logo: { icon: Layers, bg: "#fdecec", color: "#ef4444" }, name: "Databricks", sub: "$1B+ funding round announced", score: 94 },
  { logo: { icon: Snowflake, bg: "#eaf6fd", color: "#29b5e8" }, name: "Snowflake", sub: "New funding round closed", score: 93 },
  { logo: { icon: Atom, bg: "#0f172a", color: "#ffffff" }, name: "OpenAI", sub: "New funding round announced", score: 92 },
  { logo: { icon: Layers, bg: "#fdece6", color: "#fa582d" }, name: "Palo Alto Networks", sub: "Strategic funding round", score: 91 },
];

function TopMatchedCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">Top Matched Companies</h2>
        <button className="text-[12px] font-semibold text-[#5b3df5]" type="button">View All</button>
      </div>
      <div className="mt-[14px] flex flex-col gap-[14px]">
        {matchedCompanies.map((c) => (
          <div className="flex items-center gap-[12px]" key={c.name}>
            <LogoSquare bg={c.logo.bg} color={c.logo.color} icon={c.logo.icon} radius={9} size={38} />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[13px] font-bold text-[#0f172a]">{c.name}</p>
              <p className="m-0 truncate text-[12px] text-[#94a3b8]">{c.sub}</p>
            </div>
            <ScoreBadge score={c.score} />
          </div>
        ))}
      </div>
    </section>
  );
}

const activity = [
  { icon: CheckCircle2, bg: "#e7f8ef", color: "#16a34a", time: "May 20, 2025 10:30 AM", text: "Trigger executed successfully" },
  { icon: Zap, bg: "#f3e9ff", color: "#7c3aed", time: "May 20, 2025 10:30 AM", text: "156 new signals generated" },
  { icon: Pencil, bg: "#fff1e3", color: "#f97316", time: "May 19, 2025 10:30 AM", text: "Trigger conditions updated" },
  { icon: RefreshCw, bg: "#e6f0ff", color: "#2563eb", time: "May 18, 2025 10:30 AM", text: "Signal sources refreshed" },
];

function RecentActivityCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">Recent Activity</h2>
        <button className="text-[12px] font-semibold text-[#5b3df5]" type="button">View All</button>
      </div>
      <div className="mt-[14px] flex flex-col gap-[16px]">
        {activity.map((a) => {
          const Icon = a.icon;
          return (
            <div className="flex gap-[12px]" key={a.text}>
              <span className="flex size-[32px] shrink-0 items-center justify-center rounded-[9px]" style={{ backgroundColor: a.bg, color: a.color }}>
                <Icon className="size-[16px]" />
              </span>
              <div>
                <p className="m-0 text-[11px] text-[#94a3b8]">{a.time}</p>
                <p className="m-0 mt-[2px] text-[13px] font-medium text-[#334155]">{a.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function TriggerDetailPage() {
  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Trigger Intelligence" activeSub="Trigger Library" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar searchPlaceholder="Search companies, triggers, executives..." showDetection={false} />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          <nav className="flex items-center gap-[8px] text-[13px]">
            <a className="text-[#64748b] no-underline hover:text-[#334155]" href="/trigger-library">
              Trigger Library
            </a>
            <ChevronRight className="size-[14px] text-[#cbd5e1]" />
            <span className="font-semibold text-[#0f172a]">Trigger Details</span>
          </nav>

          <div className="mt-[16px]">
            <DetailHeader />
          </div>

          <DetailTabs />

          <div className="mt-[24px] grid grid-cols-1 gap-[24px] xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-[24px]">
              <OverviewCard />
              <TriggerConditionsCard />
              <RecentSignalsCard />
            </div>

            <div className="flex flex-col gap-[24px]">
              <TriggerPerformanceCard />
              <TopMatchedCard />
              <RecentActivityCard />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
