import {
  Activity,
  ArrowRight,
  Building2,
  Crosshair,
  Database,
  DollarSign,
  Target,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Delta, FLAT_LINE, Sparkline } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";
import { getSignalStats, type SignalStatsOut, type SignalWithCompanyOut } from "../../api/signals";
import { getOrganisationId } from "../../lib/session";
import { CATEGORY_COLORS, CATEGORY_LABELS, categoryStyle } from "../../lib/signalCategories";

/* Signal Intelligence shows ONLY real signal data from /signals/stats: the
 * counts (stat cards), the day-over-day trend (line chart, when there's more
 * than one day of history), the real signal_category breakdown (donut), and
 * the real top signals by confidence. All dummy fallbacks are removed - empty
 * states show when there's no data rather than fabricated numbers. */

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
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

/* SignalStatsOut has no vs-last-7-days baseline - deltas would have to be
 * fabricated. Where trend has enough real days to compare first-vs-last,
 * show a real delta; otherwise omit the line rather than invent one. The
 * sparkline now plots the real daily trend series (total/high/medium/low per
 * day) and falls back to a flat line when there's only one real day. */
function toStatCards(data: SignalStatsOut): StatCard[] {
  const trendLongEnough = data.trend.length >= 2;
  const deltaFor = (pickFrom: (p: SignalStatsOut["trend"][number]) => number): string | null => {
    if (!trendLongEnough) return null;
    const first = pickFrom(data.trend[0]);
    const last = pickFrom(data.trend[data.trend.length - 1]);
    if (first === 0) return null;
    return `${(((last - first) / first) * 100).toFixed(1)}%`;
  };
  const seriesFor = (pickFrom: (p: SignalStatsOut["trend"][number]) => number): number[] =>
    trendLongEnough ? data.trend.map(pickFrom) : FLAT_LINE;

  return [
    { icon: Target, iconBg: "bg-[#e8f0ff]", iconColor: "text-[#2563eb]", label: "Total Signals", value: data.total.toLocaleString(), delta: deltaFor((p) => p.total), color: "#2563eb", values: seriesFor((p) => p.total) },
    { icon: Crosshair, iconBg: "bg-[#f3e8ff]", iconColor: "text-[#7c3aed]", label: "High-Intent Signals", value: data.high_intent.toLocaleString(), delta: deltaFor((p) => p.high), color: "#7c3aed", values: seriesFor((p) => p.high) },
    { icon: Activity, iconBg: "bg-[#fff1e8]", iconColor: "text-[#f97316]", label: "Medium-Intent Signals", value: data.medium_intent.toLocaleString(), delta: deltaFor((p) => p.medium), color: "#f97316", values: seriesFor((p) => p.medium) },
    { icon: DollarSign, iconBg: "bg-[#e7f8ef]", iconColor: "text-[#16a34a]", label: "Low-Intent Signals", value: data.low_intent.toLocaleString(), delta: deltaFor((p) => p.low), color: "#16a34a", values: seriesFor((p) => p.low) },
  ];
}

const ZERO_STATS: SignalStatsOut = {
  total: 0, high_intent: 0, medium_intent: 0, low_intent: 0, company_count: 0, avg_confidence: 0,
  executives_impacted: 0, actionable_count: 0, by_category: [], trend: [], top_signals: [], histogram: [], by_country: [], by_source: [],
};

function StatCards({ stats }: { stats: StatCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[18px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]" key={stat.label}>
            <div className="flex items-center gap-[10px]">
              <span className={cn("flex size-[40px] shrink-0 items-center justify-center rounded-[10px]", stat.iconBg)}>
                <Icon className={cn("size-[20px]", stat.iconColor)} />
              </span>
              <span className="text-[14px] font-semibold text-[#475569]">{stat.label}</span>
            </div>
            <div className="mt-[12px] flex items-center justify-between gap-[12px]">
              <span className="text-[30px] font-bold leading-none text-[#0f172a]">{stat.value}</span>
              <Sparkline className="h-[44px] w-[46%]" color={stat.color} gradientId={`sig-spark-${stat.label.replace(/\s+/g, "")}`} values={stat.values} />
            </div>
            {stat.delta && (
              <p className="m-0 mt-[12px] flex items-center gap-[8px] text-[12px] text-[#94a3b8]">
                <Delta value={stat.delta} />
                over this period
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
          <line stroke="#eef2f7" strokeWidth="1" x1={left} x2={right} y1={yOf(g.v)} y2={yOf(g.v)} />
          <text fill="#94a3b8" fontSize="11" textAnchor="end" x={left - 8} y={yOf(g.v) + 4}>
            {g.label}
          </text>
        </g>
      ))}

      {series.map((s) => {
        const points = s.values.map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ");
        return (
          <g key={s.label}>
            <polyline fill="none" points={points} stroke={s.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
            {s.values.map((v, i) => (
              <circle cx={xOf(i)} cy={yOf(v)} fill={s.color} key={i} r="3.4" />
            ))}
          </g>
        );
      })}

      {labels.map((label, i) => (
        <text fill="#94a3b8" fontSize="11" key={label} textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"} x={xOf(i)} y={bottom + 28}>
          {label}
        </text>
      ))}
    </svg>
  );
}

function SignalTrendCard({ labels, series, hasData }: { labels: string[]; series: TrendSeries[]; hasData: boolean }) {
  return (
    <section className="flex flex-col rounded-[18px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div>
        <h2 className="m-0 text-[18px] font-bold text-[#0f172a]">Signal Trend Over Time</h2>
        <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">Signals detected per day, by confidence tier</p>
      </div>

      {!hasData ? (
        <div className="flex flex-1 items-center justify-center py-[60px] text-center text-[13px] text-[#94a3b8]">
          Not enough day-over-day history to chart yet - signals were extracted in a single batch.
        </div>
      ) : (
        <>
          <div className="mt-[16px] flex flex-wrap items-center gap-x-[20px] gap-y-[8px]">
            {series.map((s) => (
              <span className="flex items-center gap-[8px]" key={s.label}>
                <span className="size-[10px] rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-[13px] font-medium text-[#475569]">{s.label}</span>
              </span>
            ))}
          </div>
          <div className="mt-[12px] flex-1">
            <TrendChart labels={labels} series={series} />
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Signals by Category (donut)                                         */
/* ------------------------------------------------------------------ */

type CategorySegment = { label: string; color: string; pct: string; count: string; value: number };

/* Real signal.source is always "zoominfo" - no meaningful source-type split
 * exists, so this breaks down by the real signal_category field instead. */
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
      <h2 className="m-0 text-[18px] font-bold text-[#0f172a]">Signals by Category</h2>

      {segments.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-[60px] text-center text-[13px] text-[#94a3b8]">
          No signals yet.
        </div>
      ) : (
        <>
          <div className="mt-[18px] flex flex-1 flex-col items-center gap-[24px] lg:flex-row lg:items-center">
            <div className="relative size-[200px] shrink-0">
              <DonutChart segments={segments} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[28px] font-bold leading-none text-[#0f172a]">{total.toLocaleString()}</span>
                <span className="mt-[4px] text-[13px] text-[#64748b]">Total</span>
              </div>
            </div>

            <div className="flex w-full flex-1 flex-col gap-[14px]">
              {segments.map((s) => (
                <div className="flex items-center justify-between gap-[12px]" key={s.label}>
                  <span className="flex items-center gap-[10px]">
                    <span className="size-[10px] rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-[14px] font-medium text-[#334155]">{s.label}</span>
                  </span>
                  <span className="whitespace-nowrap text-[14px] font-semibold text-[#0f172a]">
                    {s.pct} <span className="font-normal text-[#94a3b8]">({s.count})</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <a className="mt-[20px] flex items-center gap-[8px] text-[14px] font-semibold text-[#4f46e5] no-underline" href="/signal-analytics">
            View full analytics
            <ArrowRight className="size-[16px]" />
          </a>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Top High-Intent Signals (table)                                     */
/* ------------------------------------------------------------------ */

type Brand = { label: string; bg: string; color: string; icon?: IconType };

function LogoSquare({ bg, color, icon: Icon }: Omit<Brand, "label">) {
  return (
    <span className="flex size-[28px] shrink-0 items-center justify-center rounded-[8px] text-[10px] font-bold" style={{ backgroundColor: bg, color }}>
      {Icon ? <Icon className="size-[16px]" /> : null}
    </span>
  );
}

function BrandCell({ brand }: { brand: Brand }) {
  return (
    <span className="flex min-w-0 items-center gap-[10px]">
      <LogoSquare bg={brand.bg} color={brand.color} icon={brand.icon} />
      <span className="truncate text-[13px] font-medium text-[#334155]">{brand.label}</span>
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
  signalId: string;
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
  return s.replace(/_/g, " ").split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

function impactFor(confidence: number): string {
  if (confidence >= 0.85) return "Very High";
  if (confidence >= 0.6) return "High";
  if (confidence >= 0.4) return "Medium";
  return "Low";
}

function toSignalRow(s: SignalWithCompanyOut): SignalRow {
  const confidence = s.signal_confidence ?? 0;
  const cat = categoryStyle(s.signal_category);
  return {
    signalId: s.signal_id,
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

const tableColumns = "grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_0.9fr_1fr_0.8fr]";

function TopHighIntentSignals({ rows }: { rows: SignalRow[] }) {
  return (
    <section className="rounded-[18px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-[16px]">
        <div>
          <h2 className="m-0 text-[18px] font-bold text-[#0f172a]">Top Signals</h2>
          <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">Highest-confidence signals across your companies</p>
        </div>
        <a className="flex shrink-0 items-center gap-[8px] text-[13px] font-semibold text-[#4f46e5] no-underline" href="/signal-feed">
          View All Signals
          <ArrowRight className="size-[15px]" />
        </a>
      </div>

      {rows.length === 0 ? (
        <div className="py-[48px] text-center text-[13px] text-[#94a3b8]">No signals extracted yet.</div>
      ) : (
        <div className="mt-[18px] overflow-x-auto">
          <div className="min-w-[860px]">
            <div className={cn("grid items-center gap-[16px] border-b border-[#eef1f6] pb-[12px] text-[11px] font-semibold uppercase tracking-[0.03em] text-[#94a3b8]", tableColumns)}>
              <span>Signal</span>
              <span>Account</span>
              <span>Source</span>
              <span>Intent Score</span>
              <span>Detected At</span>
              <span>Impact</span>
            </div>

            <div className="divide-y divide-[#f1f5f9]">
              {rows.map((row) => {
                const Icon = row.icon;
                return (
                  <div
                    className={cn("grid cursor-pointer items-center gap-[16px] py-[14px]", tableColumns)}
                    key={row.signalId}
                    onClick={() => {
                      window.location.href = `/signal-detail?id=${row.signalId}`;
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex min-w-0 items-center gap-[12px]">
                      <span className="flex size-[36px] shrink-0 items-center justify-center rounded-[10px]" style={{ backgroundColor: row.iconBg, color: row.iconColor }}>
                        <Icon className="size-[19px]" />
                      </span>
                      <div className="min-w-0">
                        <p className="m-0 truncate text-[14px] font-bold text-[#0f172a]">{row.title}</p>
                        <p className="m-0 truncate text-[12px] text-[#94a3b8]">{row.subtitle}</p>
                      </div>
                    </div>

                    <BrandCell brand={row.account} />
                    <BrandCell brand={row.source} />

                    <div>
                      <span className="inline-flex items-center justify-center rounded-[8px] bg-[#efeafe] px-[12px] py-[5px] text-[13px] font-bold text-[#6d28d9]">{row.score}</span>
                    </div>

                    <span className="text-[13px] text-[#64748b]">{row.detected}</span>

                    <span className={cn("text-[13px] font-semibold", impactTones[row.impact])}>{row.impact}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const TREND_COLORS = { total: "#2563eb", high: "#7c3aed", medium: "#f97316", low: "#16a34a" };

export function SignalIntelligencePage() {
  const [statsData, setStatsData] = useState<SignalStatsOut | null>(null);

  useEffect(() => {
    const organisationId = getOrganisationId();
    if (!organisationId) {
      return;
    }
    getSignalStats(organisationId)
      .then(setStatsData)
      .catch(() => setStatsData(null));
  }, []);

  const data = statsData ?? ZERO_STATS;
  const statCards = toStatCards(data);
  const hasTrend = data.trend.length >= 2;
  const trendLabels = data.trend.map((p) => p.date);
  const trendSeries: TrendSeries[] = [
    { label: "Total Signals", color: TREND_COLORS.total, values: data.trend.map((p) => p.total) },
    { label: "High-Intent Signals", color: TREND_COLORS.high, values: data.trend.map((p) => p.high) },
    { label: "Medium-Intent Signals", color: TREND_COLORS.medium, values: data.trend.map((p) => p.medium) },
    { label: "Low-Intent Signals", color: TREND_COLORS.low, values: data.trend.map((p) => p.low) },
  ];
  const categorySegments = toCategorySegments(data);
  const topRows = data.top_signals.map(toSignalRow);

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Signal Intelligence" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          searchPlaceholder="Search companies, triggers, executives..."
          showDetection={false}
          showNotificationBell={false}
        />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[24px]">
          <div>
            <div className="flex items-center gap-[12px]">
              <h1 className="m-0 text-[28px] font-bold text-[#0f172a]">Signal Intelligence Engine</h1>
              <span className="flex items-center gap-[7px] rounded-full bg-[#eef1ff] px-[12px] py-[5px]">
                <span className="size-[8px] rounded-full bg-[#16a34a]" />
                <span className="text-[13px] font-semibold text-[#4f46e5]">Live</span>
              </span>
            </div>
            <p className="m-0 mt-[8px] text-[15px] text-[#64748b]">
              Identify, analyze, and prioritize high-intent signals from your uploaded data.
            </p>
          </div>

          <div className="mt-[22px]">
            <StatCards stats={statCards} />
          </div>

          <div className="mt-[22px] grid grid-cols-1 gap-[20px] xl:grid-cols-[1.6fr_1fr]">
            <SignalTrendCard hasData={hasTrend} labels={trendLabels} series={trendSeries} />
            <SourceTypeCard segments={categorySegments} total={data.total} />
          </div>

          <div className="mt-[22px]">
            <TopHighIntentSignals rows={topRows} />
          </div>
        </main>
      </div>
    </div>
  );
}
