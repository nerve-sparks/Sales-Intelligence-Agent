import {
  Activity,
  Building2,
  Gauge,
  Info,
  PieChart,
  Target,
  Users,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";
import type { Data, ISOCode } from "react-svg-worldmap";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Donut, smoothPath } from "../../components/ui/dataviz";
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
    <div>
      <h1 className="m-0 text-[26px] font-bold text-[#0f172a]">Signal Analytics</h1>
      <p className="m-0 mt-[6px] text-[15px] text-[#64748b]">
        Signal performance, trends, and impact across your uploaded company data.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KPI cards                                                           */
/* ------------------------------------------------------------------ */

type Kpi = { icon: IconType; bg: string; color: string; label: string; value: string };

/* All values are real aggregates from /signals/stats. No vs-previous-period
 * baseline exists for a single snapshot, so no delta line is shown. */
function toKpis(data: SignalStatsOut): Kpi[] {
  const actionableRate = data.total > 0 ? Math.round((data.actionable_count / data.total) * 100) : 0;
  return [
    { icon: Activity, bg: "#f3e9ff", color: "#7c3aed", label: "Total Signals", value: data.total.toLocaleString() },
    { icon: Target, bg: "#e7f8ef", color: "#16a34a", label: "High-Intent Signals", value: data.high_intent.toLocaleString() },
    { icon: Building2, bg: "#e6f0ff", color: "#2563eb", label: "Companies with Signals", value: data.company_count.toLocaleString() },
    { icon: Users, bg: "#fff1e3", color: "#f97316", label: "Decision-Makers Reached", value: data.executives_impacted.toLocaleString() },
    { icon: Gauge, bg: "#ffe9f0", color: "#e11d48", label: "Avg. Confidence", value: data.avg_confidence !== null ? `${Math.round(data.avg_confidence * 100)}%` : "—" },
    { icon: PieChart, bg: "#f3e9ff", color: "#7c3aed", label: "% Actionable Signals", value: `${actionableRate}%` },
  ];
}

function KpiCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-[16px] md:grid-cols-3 xl:grid-cols-6">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[16px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]" key={kpi.label}>
            <div className="flex items-center gap-[10px]">
              <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px]" style={{ backgroundColor: kpi.bg, color: kpi.color }}>
                <Icon className="size-[19px]" />
              </span>
              <span className="text-[13px] font-semibold text-[#475569]">{kpi.label}</span>
            </div>
            <p className="m-0 mt-[12px] text-[26px] font-bold leading-none text-[#0f172a]">{kpi.value}</p>
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

/* ------------------------------------------------------------------ */
/* Signals Over Time (two-line chart)                                  */
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

function SignalsOverTimeCard({ labels, series, hasData }: { labels: string[]; series: TrendSeries[]; hasData: boolean }) {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <CardHead title="Signals Over Time" />
      {!hasData ? (
        <div className="py-[60px] text-center text-[13px] text-[#94a3b8]">
          Not enough day-over-day history to chart yet.
        </div>
      ) : (
        <>
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
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Signals by Category (donut)                                         */
/* ------------------------------------------------------------------ */

type CategorySegment = { label: string; value: number; pct: string; color: string };

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
      <CardHead title="Signals by Category" />
      {segments.length === 0 ? (
        <div className="py-[60px] text-center text-[13px] text-[#94a3b8]">No signals yet.</div>
      ) : (
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
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Intent Score Distribution (bar chart)                               */
/* ------------------------------------------------------------------ */

type HistogramBar = { label: string; value: number };

function toDistributionBars(data: SignalStatsOut): HistogramBar[] {
  return data.histogram.map((b) => ({ label: b.bucket, value: b.count }));
}

function DistributionChart({ bars }: { bars: HistogramBar[] }) {
  const w = 560;
  const h = 360;
  const left = 44;
  const right = w - 16;
  const top = 26;
  const bottom = 300;

  const maxValue = Math.max(1, ...bars.map((b) => b.value));
  const step = niceStep(maxValue);
  const yMax = step * 4;
  const grid = [0, step, step * 2, step * 3, step * 4];
  const yOf = (v: number) => bottom - (v / yMax) * (bottom - top);
  const band = (right - left) / bars.length;
  const barW = 56;

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
    <section className="flex flex-col rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <CardHead title="Intent Score Distribution" />
      {bars.every((b) => b.value === 0) ? (
        <div className="flex flex-1 items-center justify-center py-[60px] text-center text-[13px] text-[#94a3b8]">No signals yet.</div>
      ) : (
        <div className="mt-[14px] flex flex-1 items-center">
          <DistributionChart bars={bars} />
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Signals by Intent Level (donut)                                     */
/* ------------------------------------------------------------------ */

type IntentSegment = { label: string; value: number; pct: string; color: string };

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
      <CardHead title="Signals by Intent Level" />
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
      <CardHead title="Geographic Distribution" />
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
            {countries.length === 0 ? (
              <p className="m-0 text-[13px] text-[#94a3b8]">No country data yet.</p>
            ) : (
              countries.slice(0, 5).map((c) => (
                <div className="flex items-center justify-between gap-[10px]" key={c.name}>
                  <span className="text-[13px] text-[#334155]">{c.name}</span>
                  <span className="whitespace-nowrap text-[13px] text-[#94a3b8]">
                    <span className="font-semibold text-[#0f172a]">{c.value.toLocaleString()}</span> ({c.pct})
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const ZERO_STATS: SignalStatsOut = {
  total: 0, high_intent: 0, medium_intent: 0, low_intent: 0, company_count: 0, avg_confidence: 0,
  executives_impacted: 0, actionable_count: 0, by_category: [], trend: [], top_signals: [], histogram: [], by_country: [], by_source: [],
};

export function SignalAnalyticsPage() {
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
  const kpis = toKpis(data);
  const hasTrend = data.trend.length >= 2;
  const overTimeLabels = data.trend.map((p) => p.date);
  const overTimeSeries: TrendSeries[] = [
    { label: "Total Signals", color: "#7c3aed", values: data.trend.map((p) => p.total) },
    { label: "High Intent Signals", color: "#16a34a", values: data.trend.map((p) => p.high) },
  ];
  const categorySegments = toCategorySegments(data);
  const distributionBars = toDistributionBars(data);
  const intentSegments = toIntentSegments(data);
  const countries = toCountries(data);
  const geoData = toGeoData(countries);

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Signal Intelligence" activeSub="Signal Analytics" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          searchPlaceholder="Search companies, triggers, executives..."
          showDetection={false}
          showNotificationBell={false}
        />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          <AnalyticsHeader />

          <div className="mt-[22px]">
            <KpiCards kpis={kpis} />
          </div>

          <div className="mt-[20px] grid grid-cols-1 gap-[20px] xl:grid-cols-3">
            <SignalsOverTimeCard hasData={hasTrend} labels={overTimeLabels} series={overTimeSeries} />
            <CategoryCard segments={categorySegments} total={data.total} />
            <IntentLevelCard segments={intentSegments} total={data.total} />
          </div>

          <div className="mt-[20px] grid grid-cols-1 gap-[20px] lg:grid-cols-2">
            <DistributionCard bars={distributionBars} />
            <GeographicCard countries={countries} geoData={geoData} />
          </div>
        </main>
      </div>
    </div>
  );
}
