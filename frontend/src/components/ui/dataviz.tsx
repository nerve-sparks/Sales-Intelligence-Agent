/* Reusable data-visualization primitives shared across feature pages. */

export function UpTriangle({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 8 8">
      <path d="M4 0.5 L7.5 7.5 L0.5 7.5 Z" />
    </svg>
  );
}

export function Delta({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-[3px] text-[13px] font-semibold text-[#16a34a]">
      <UpTriangle className="size-[8px]" />
      {value}
    </span>
  );
}

export type Point = { x: number; y: number };

/* A flat two-point series for sparklines with no real time series to plot.
   Rendered as a centered horizontal line (see toPoints) — reads honestly as
   "no trend data" instead of a fabricated zig-zag. */
export const FLAT_LINE = [1, 1];

export function toPoints(
  values: number[],
  w: number,
  h: number,
  pad: number,
): Point[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const stepX = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  return values.map((v, i) => ({
    x: pad + i * stepX,
    // Flat series (all equal) → draw through the vertical centre rather than
    // pinning to the bottom edge.
    y: range === 0 ? h / 2 : h - pad - ((v - min) / range) * (h - pad * 2),
  }));
}

export function smoothPath(points: Point[]): string {
  if (points.length < 2) {
    return "";
  }

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return d;
}

export function Donut({
  segments,
  size = 200,
  thickness = 28,
  gap = 2,
  className = "size-full",
}: {
  segments: { value: number; color: string }[];
  size?: number;
  thickness?: number;
  gap?: number;
  className?: string;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  let offset = 0;

  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segments.map((s, i) => {
          const len = (s.value / total) * circumference;
          const dash = Math.max(len - gap, 0);
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

export function Sparkline({
  values,
  color,
  gradientId,
  className = "h-[54px] w-full",
}: {
  values: number[];
  color: string;
  gradientId: string;
  className?: string;
}) {
  const w = 320;
  const h = 60;
  const pts = toPoints(values, w, h, 7);
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x} ${h} L ${pts[0].x} ${h} Z`;

  return (
    <svg className={className} preserveAspectRatio="none" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      {pts.map((p, i) => (
        <circle cx={p.x} cy={p.y} fill={color} key={i} r="2.4" />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Multi-series trend chart                                            */
/* ------------------------------------------------------------------ */

export type TrendLineSeries = { label: string; color: string; values: number[] };

/** Evenly spaced indices for x-axis labels - never more than maxTicks. */
export function pickTickIndices(length: number, maxTicks = 6): number[] {
  if (length <= 0) return [];
  if (length <= maxTicks) return Array.from({ length }, (_, i) => i);
  const out = new Set<number>([0, length - 1]);
  for (let t = 1; t < maxTicks - 1; t += 1) {
    out.add(Math.round((t * (length - 1)) / (maxTicks - 1)));
  }
  return [...out].sort((a, b) => a - b);
}

export function formatChartDate(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function weekStartKey(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * When a daily series is denser than ~a month of points, roll up to calendar
 * weeks so the chart stays readable. Below that threshold the raw days are
 * kept - sparse real data should not be artificially bucketed.
 */
export function bucketTrendForChart(
  labels: string[],
  series: TrendLineSeries[],
  dailyLimit = 28,
): { labels: string[]; series: TrendLineSeries[] } {
  if (labels.length <= dailyLimit) {
    return {
      labels: labels.map(formatChartDate),
      series,
    };
  }

  const buckets: { key: string; sums: number[] }[] = [];
  const indexByKey = new Map<string, number>();

  labels.forEach((label, i) => {
    const key = weekStartKey(label);
    let idx = indexByKey.get(key);
    if (idx === undefined) {
      idx = buckets.length;
      indexByKey.set(key, idx);
      buckets.push({ key, sums: series.map(() => 0) });
    }
    series.forEach((s, si) => {
      buckets[idx!].sums[si] += s.values[i] ?? 0;
    });
  });

  return {
    labels: buckets.map((b) => formatChartDate(b.key)),
    series: series.map((s, si) => ({
      ...s,
      values: buckets.map((b) => b.sums[si]),
    })),
  };
}

function niceYStep(maxValue: number): number {
  const rough = maxValue / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough || 1));
  const normalized = rough / magnitude;
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return Math.max(1, Math.ceil(nice * magnitude));
}

function formatYTick(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`;
  return String(v);
}

/** Clean multi-line trend: week-bucketed when dense, sparse x labels, smooth
 * strokes, dots only when the series is short enough to stay uncluttered. */
export function TrendLineChart({
  labels,
  series,
  width = 640,
  height = 300,
  xAxisLabel = "Date published",
  yAxisLabel = "Number of signals",
}: {
  labels: string[];
  series: TrendLineSeries[];
  width?: number;
  height?: number;
  /** Plain-language label for the horizontal axis. */
  xAxisLabel?: string;
  /** Plain-language label for the vertical axis. */
  yAxisLabel?: string;
}) {
  const prepared = bucketTrendForChart(labels, series);
  const chartLabels = prepared.labels;
  const chartSeries = prepared.series;
  const n = chartLabels.length;
  const isWeekly = labels.length > 28;
  const xLabel = isWeekly && xAxisLabel === "Date published" ? "Week published" : xAxisLabel;

  const left = 58;
  const right = width - 16;
  const top = 18;
  const bottom = height - 48;

  const maxSeriesValue = Math.max(1, ...chartSeries.flatMap((s) => s.values));
  const step = niceYStep(maxSeriesValue);
  const yMax = Math.max(step * 4, Math.ceil(maxSeriesValue / step) * step);
  const gridValues = [0, step, step * 2, step * 3, step * 4]
    .map((v) => Math.min(v, yMax))
    .filter((v, i, arr) => arr.indexOf(v) === i);

  const xOf = (i: number) => left + (n > 1 ? (i * (right - left)) / (n - 1) : 0);
  const yOf = (v: number) => bottom - (v / yMax) * (bottom - top);
  const tickIndices = pickTickIndices(n, 6);
  const showDots = n <= 14;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  return (
    <svg className="w-full" viewBox={`0 0 ${width} ${height}`}>
      {/* Y-axis title */}
      <text
        fill="#64748b"
        fontSize="11"
        fontWeight="600"
        textAnchor="middle"
        transform={`rotate(-90, 14, ${midY})`}
        x={14}
        y={midY}
      >
        {yAxisLabel}
      </text>

      {gridValues.map((v) => (
        <g key={v}>
          <line stroke="#eef2f7" strokeWidth="1" x1={left} x2={right} y1={yOf(v)} y2={yOf(v)} />
          <text fill="#94a3b8" fontSize="11" textAnchor="end" x={left - 8} y={yOf(v) + 4}>
            {formatYTick(v)}
          </text>
        </g>
      ))}

      {chartSeries.map((s) => {
        const pts = s.values.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
        const line = smoothPath(pts);
        return (
          <g key={s.label}>
            <path d={line} fill="none" stroke={s.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
            {showDots &&
              pts.map((p, i) => (
                <circle cx={p.x} cy={p.y} fill="#fff" key={i} r="3.2" stroke={s.color} strokeWidth="2" />
              ))}
          </g>
        );
      })}

      {tickIndices.map((i) => (
        <text
          fill="#94a3b8"
          fontSize="11"
          key={`${chartLabels[i]}-${i}`}
          textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
          x={xOf(i)}
          y={bottom + 20}
        >
          {chartLabels[i]}
        </text>
      ))}

      {/* X-axis title */}
      <text fill="#64748b" fontSize="11" fontWeight="600" textAnchor="middle" x={midX} y={height - 8}>
        {xLabel}
      </text>
    </svg>
  );
}

