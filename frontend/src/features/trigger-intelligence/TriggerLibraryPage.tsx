import {
  Activity,
  ArrowRight,
  Building2,
  ChevronRight,
  Download,
  Filter,
  LayoutGrid,
  Plus,
  Search,
  Settings,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Donut } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";
import { getTriggers, type SavedTrigger } from "../../lib/triggers";
import { getTriggerEvents, listTriggers } from "../../api/triggers";
import { getSignalStats, type SignalStatsOut } from "../../api/signals";
import { getOrganisationId, getWorkspaceId } from "../../lib/session";
import {
  CATEGORY_DESCRIPTIONS,
  categoryLabel,
  categoryStyle,
  SIGNAL_CATEGORY_OPTIONS,
} from "../../lib/signalCategories";

/* TriggerDefinition (backend) has no category/description/status fields -
 * those are frontend-only concepts (see onboarding audit). Real id/name
 * come from the API; the rest falls back to sensible defaults so the
 * existing TriggerCard rendering needs no changes. */
function toSavedTrigger(trigger: {
  trigger_id: string;
  name: string | null;
  signal_types: string[] | null;
  signal_categories: string[] | null;
}): SavedTrigger {
  return {
    id: trigger.trigger_id,
    name: trigger.name || "Untitled Trigger",
    category: trigger.signal_categories?.[0] || trigger.signal_types?.[0] || "General",
    description:
      [trigger.signal_types, trigger.signal_categories].flat().filter(Boolean).join(", ") || "Custom trigger",
    status: "active",
  };
}

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

type IconType = ComponentType<{ className?: string }>;

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

type Category = {
  key: string;
  name: string;
  desc: string;
  icon: IconType;
  color: string;
  bg: string;
  count: number;
  pct: string;
  signals: string;
  vol: number;
  companies: string;
  score: number;
};

type CategoryStat = { count: number; companies: number; score: number };

/* Same 6 real signal_category values as the Trigger Editor's category
 * select (see signalCategories.ts) - these placeholder numbers are only
 * shown before real org data loads or when no backend/org is configured. */
const dummyCategoryStats: Record<string, CategoryStat> = {
  buying_stage: { count: 210, companies: 175, score: 68 },
  ai_seriousness: { count: 145, companies: 120, score: 62 },
  urgency_and_catalysts: { count: 132, companies: 110, score: 59 },
  ai_pain_points: { count: 98, companies: 80, score: 55 },
  budget_and_capital: { count: 64, companies: 58, score: 71 },
  competitive_context: { count: 47, companies: 40, score: 52 },
};

function realCategoryStats(data: SignalStatsOut): Record<string, CategoryStat> {
  const stats: Record<string, CategoryStat> = {};
  for (const key of SIGNAL_CATEGORY_OPTIONS) {
    const row = data.by_category.find((c) => c.signal_category === key);
    stats[key] = {
      count: row?.count ?? 0,
      companies: row?.company_count ?? 0,
      score: row ? Math.round((row.avg_confidence ?? 0) * 100) : 0,
    };
  }
  return stats;
}

function buildCategories(stats: Record<string, CategoryStat>): Category[] {
  const total = Math.max(1, Object.values(stats).reduce((sum, s) => sum + s.count, 0));
  return SIGNAL_CATEGORY_OPTIONS.map((key) => {
    const style = categoryStyle(key);
    const s = stats[key];
    return {
      key,
      name: categoryLabel(key),
      desc: CATEGORY_DESCRIPTIONS[key] ?? "",
      icon: style.icon,
      color: style.color,
      bg: style.bg,
      count: s.count,
      pct: `${Math.round((s.count / total) * 100)}%`,
      signals: s.count.toLocaleString(),
      vol: s.count,
      companies: s.companies.toLocaleString(),
      score: s.score,
    };
  });
}

const dummyCategories = buildCategories(dummyCategoryStats);

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function LibraryHeader() {
  return (
    <div>
      <nav className="flex flex-wrap items-center gap-[8px] text-[13px] text-[#64748b]">
        <a className="no-underline hover:text-[#334155]" href="/dashboard">
          Trigger Intelligence
        </a>
        <ChevronRight className="size-[14px] text-[#cbd5e1]" />
        <span className="font-semibold text-[#0f172a]">Trigger Library</span>
      </nav>

      <div className="mt-[12px] flex flex-col gap-[16px] xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="m-0 text-[26px] font-bold text-[#0f172a]">Trigger Library</h1>
          <p className="m-0 mt-[6px] text-[15px] text-[#64748b]">
            Organize and explore triggers to discover high-impact opportunities.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-[12px]">
          <div className="relative w-[240px]">
            <Search className="pointer-events-none absolute left-[14px] top-1/2 size-[16px] -translate-y-1/2 text-[#94a3b8]" />
            <input
              className="h-[44px] w-full rounded-[10px] border border-[#e9edf5] bg-white pl-[40px] pr-[14px] text-[14px] text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
              placeholder="Search signals..."
              type="search"
            />
          </div>
          <button
            className="flex h-[44px] items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] text-[14px] font-semibold text-[#334155]"
            type="button"
          >
            <Filter className="size-[16px] text-[#64748b]" />
            Filters
          </button>
          <button
            className="flex h-[44px] items-center gap-[8px] rounded-[10px] bg-[#fa5a1e] px-[18px] text-[14px] font-semibold text-white shadow-[0px_10px_20px_-6px_rgba(250,90,30,0.5)]"
            onClick={() => {
              window.location.href = "/trigger-editor";
            }}
            type="button"
          >
            <Plus className="size-[17px]" />
            Create Trigger
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Summary stat cards                                                  */
/* ------------------------------------------------------------------ */

type SummaryStat = { icon: IconType; bg: string; color: string; value: string; label: string; sub: string };

const dummyCompanyCount = 480;
const dummyAvgConfidence = 61;

function buildSummary(data: SignalStatsOut | null): SummaryStat[] {
  const totalSignals = data ? data.total : Object.values(dummyCategoryStats).reduce((sum, s) => sum + s.count, 0);
  const companies = data ? data.company_count : dummyCompanyCount;
  const avgAccuracy = `${data && data.avg_confidence !== null ? Math.round(data.avg_confidence * 100) : dummyAvgConfidence}%`;
  return [
    { icon: LayoutGrid, bg: "#f3e9ff", color: "#7c3aed", value: String(SIGNAL_CATEGORY_OPTIONS.length), label: "Categories", sub: "Total signal categories" },
    { icon: Activity, bg: "#e7f8ef", color: "#16a34a", value: totalSignals.toLocaleString(), label: "Signals", sub: "Across all categories" },
    { icon: Building2, bg: "#e6f0ff", color: "#2563eb", value: companies.toLocaleString(), label: "Companies Impacted", sub: "From uploaded data" },
    { icon: Settings, bg: "#fff1e3", color: "#f97316", value: avgAccuracy, label: "Avg. Confidence", sub: "Across all categories" },
  ];
}

function SummaryCards({ summary }: { summary: SummaryStat[] }) {
  return (
    <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 xl:grid-cols-4">
      {summary.map((s) => {
        const Icon = s.icon;
        return (
          <div
            className="flex items-start gap-[16px] rounded-[16px] border border-[#eef1f6] bg-white p-[18px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]"
            key={s.label}
          >
            <span
              className="flex size-[52px] shrink-0 items-center justify-center rounded-[12px]"
              style={{ backgroundColor: s.bg, color: s.color }}
            >
              <Icon className="size-[24px]" />
            </span>
            <div>
              <p className="m-0 text-[26px] font-bold leading-none text-[#0f172a]">
                {s.value}
              </p>
              <p className="m-0 mt-[6px] text-[15px] font-semibold text-[#334155]">
                {s.label}
              </p>
              <p className="m-0 mt-[3px] text-[12px] text-[#94a3b8]">{s.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Category cards                                                      */
/* ------------------------------------------------------------------ */

function CategoryCard({ category }: { category: Category }) {
  const Icon = category.icon;
  return (
    <div
      className="flex cursor-pointer flex-col rounded-[16px] border border-[#eef1f6] bg-white p-[16px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)] transition hover:border-[#d7dcff] hover:shadow-[0px_8px_20px_-8px_rgba(91,61,245,0.25)]"
      onClick={() => {
        window.location.href = "/trigger-details";
      }}
      role="button"
      tabIndex={0}
    >
      <span
        className="flex size-[48px] items-center justify-center rounded-[12px]"
        style={{ backgroundColor: category.bg, color: category.color }}
      >
        <Icon className="size-[24px]" />
      </span>
      <h3 className="m-0 mt-[14px] text-[15px] font-bold text-[#0f172a]">
        {category.name}
      </h3>
      <p className="m-0 mt-[6px] text-[12px] leading-[18px] text-[#64748b]">
        {category.desc}
      </p>
      <span
        className="mt-[12px] inline-flex w-fit items-center rounded-[7px] px-[10px] py-[4px] text-[12px] font-semibold"
        style={{ backgroundColor: category.bg, color: category.color }}
      >
        {category.count} Signals
      </span>

      <div className="mt-[12px] grid grid-cols-3 gap-[6px] border-t border-[#f1f5f9] pt-[10px]">
        {[
          ["Signals", category.signals],
          ["Companies", category.companies],
          ["Avg. Score", String(category.score)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="m-0 min-h-[20px] text-[8px] font-medium uppercase leading-[10px] tracking-[0.01em] text-[#94a3b8]">
              {label}
            </p>
            <p className="m-0 mt-[2px] text-[13px] font-bold text-[#0f172a]">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <div className="grid grid-cols-2 gap-[16px] md:grid-cols-3 xl:grid-cols-5">
      {categories.map((c) => (
        <CategoryCard category={c} key={c.key} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* User-created triggers                                               */
/* ------------------------------------------------------------------ */

type TriggerStat = { events: number; companies: number } | null;

/* Same icon/color per signal_category as the Trigger Editor's category
 * select and the category cards above (signalCategories.CATEGORY_STYLE) -
 * a trigger created for "buying_stage" always renders with the same icon
 * everywhere it appears. */
function TriggerCard({ trigger, stat }: { trigger: SavedTrigger; stat: TriggerStat }) {
  const style = categoryStyle(trigger.category);
  const Icon = style.icon;
  const active = trigger.status === "active";

  return (
    <div
      className="flex cursor-pointer flex-col rounded-[16px] border border-[#eef1f6] bg-white p-[16px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)] transition hover:border-[#d7dcff] hover:shadow-[0px_8px_20px_-8px_rgba(91,61,245,0.25)]"
      onClick={() => {
        window.location.href = "/trigger-details";
      }}
      role="button"
      tabIndex={0}
    >
      <span
        className="flex size-[48px] items-center justify-center rounded-[12px]"
        style={{ backgroundColor: style.bg, color: style.color }}
      >
        <Icon className="size-[24px]" />
      </span>
      <h3 className="m-0 mt-[14px] truncate text-[15px] font-bold text-[#0f172a]">
        {trigger.name}
      </h3>
      <p className="m-0 mt-[6px] line-clamp-2 min-h-[36px] text-[12px] leading-[18px] text-[#64748b]">
        {trigger.description || "Custom trigger"}
      </p>
      <span
        className={cn(
          "mt-[12px] inline-flex w-fit items-center gap-[6px] rounded-[7px] px-[10px] py-[4px] text-[12px] font-semibold",
          active ? "bg-[#e7f8ef] text-[#16a34a]" : "bg-[#f1f5f9] text-[#64748b]",
        )}
      >
        <span className={cn("size-[7px] rounded-full", active ? "bg-[#16a34a]" : "bg-[#94a3b8]")} />
        {active ? "Active" : "Draft"}
      </span>

      <div className="mt-[12px] grid grid-cols-3 gap-[6px] border-t border-[#f1f5f9] pt-[10px]">
        {[
          ["Signals", stat ? stat.events.toLocaleString() : "—"],
          ["Companies", stat ? stat.companies.toLocaleString() : "—"],
          ["Status", stat ? (stat.events > 0 ? "Matching" : "No matches") : "Checking…"],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="m-0 min-h-[20px] text-[8px] font-medium uppercase leading-[10px] tracking-[0.01em] text-[#94a3b8]">
              {label}
            </p>
            <p className="m-0 mt-[2px] text-[13px] font-bold text-[#0f172a]">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function YourTriggers({ triggers, stats }: { triggers: SavedTrigger[]; stats: Record<string, TriggerStat> }) {
  if (triggers.length === 0) {
    return null;
  }
  return (
    <div>
      <h2 className="m-0 mb-[14px] text-[18px] font-bold text-[#0f172a]">Your Triggers</h2>
      <div className="grid grid-cols-2 gap-[16px] md:grid-cols-3 xl:grid-cols-5">
        {triggers.map((t) => (
          <TriggerCard key={t.id} stat={stats[t.id] ?? null} trigger={t} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Category Distribution Overview                                      */
/* ------------------------------------------------------------------ */

function DistributionOverview({ categories, totalSignals }: { categories: Category[]; totalSignals: number }) {
  const half = Math.ceil(categories.length / 2);
  const legendLeft = categories.slice(0, half);
  const legendRight = categories.slice(half);

  const LegendRow = ({ c }: { c: Category }) => (
    <div className="flex items-center justify-between gap-[10px]">
      <span className="flex min-w-0 items-center gap-[10px]">
        <span className="size-[10px] shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
        <span className="truncate text-[13px] font-medium text-[#334155]">{c.name}</span>
      </span>
      <span className="whitespace-nowrap text-[13px] text-[#94a3b8]">
        <span className="font-semibold text-[#0f172a]">{c.count}</span> ({c.pct})
      </span>
    </div>
  );

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[18px] font-bold text-[#0f172a]">
        Category Distribution Overview
      </h2>

      <div className="mt-[18px] flex flex-col items-center gap-[28px] lg:flex-row">
        <div className="relative size-[190px] shrink-0">
          <Donut
            segments={categories.map((c) => ({ value: c.count, color: c.color }))}
            size={190}
            thickness={26}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[26px] font-bold leading-none text-[#0f172a]">{totalSignals.toLocaleString()}</span>
            <span className="mt-[4px] text-[12px] text-[#64748b]">Total Signals</span>
          </div>
        </div>

        <div className="grid w-full flex-1 grid-cols-1 gap-x-[40px] gap-y-[12px] md:grid-cols-2">
          <div className="flex flex-col gap-[12px]">
            {legendLeft.map((c) => (
              <LegendRow c={c} key={c.key} />
            ))}
          </div>
          <div className="flex flex-col gap-[12px]">
            {legendRight.map((c) => (
              <LegendRow c={c} key={c.key} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Right rail                                                          */
/* ------------------------------------------------------------------ */

const perfColumns = "grid-cols-[minmax(0,1.5fr)_0.7fr_0.8fr_0.7fr]";

function CategoryPerformanceCard({ categories }: { categories: Category[] }) {
  const rows = [...categories].sort((a, b) => b.vol - a.vol);
  const maxVol = Math.max(1, ...rows.map((r) => r.vol));

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">
          Category Performance
        </h2>
        <button className="text-[12px] font-semibold text-[#5b3df5]" type="button">
          View Analytics
        </button>
      </div>

      <div className={cn("mt-[16px] grid gap-[8px] pb-[8px] text-[10px] font-semibold uppercase tracking-[0.02em] text-[#94a3b8]", perfColumns)}>
        <span>Category</span>
        <span className="text-right">Signals</span>
        <span className="text-right">Companies</span>
        <span className="text-right">Avg. Score</span>
      </div>

      <div className="flex flex-col gap-[14px]">
        {rows.map((r) => (
          <div className={cn("grid items-center gap-[8px]", perfColumns)} key={r.key}>
            <div className="min-w-0">
              <p className="m-0 truncate text-[12px] font-semibold text-[#0f172a]">
                {r.name}
              </p>
              <span className="mt-[5px] block h-[3px] rounded-full" style={{ width: `${(r.vol / maxVol) * 100}%`, backgroundColor: r.color }} />
            </div>
            <span className="text-right text-[12px] font-semibold text-[#0f172a]">{r.signals}</span>
            <span className="text-right text-[12px] text-[#64748b]">{r.companies}</span>
            <span className="text-right text-[12px] font-semibold text-[#0f172a]">{r.score}</span>
          </div>
        ))}
      </div>

      <button className="mt-[18px] flex w-full items-center justify-center gap-[6px] text-[13px] font-semibold text-[#5b3df5]" type="button">
        View All Categories
        <ArrowRight className="size-[15px]" />
      </button>
    </section>
  );
}

function AIInsightsCard({ categories }: { categories: Category[] }) {
  const byVolume = [...categories].sort((a, b) => b.vol - a.vol);
  const byScore = [...categories].sort((a, b) => b.score - a.score);
  const topVolume = byVolume[0];
  const topScore = byScore[0];

  const bullets = [
    `${topVolume.name} triggers have the highest signal volume (${topVolume.signals} signals, ${topVolume.companies} companies).`,
    `${topScore.name} shows the strongest average confidence score (${topScore.score}).`,
    "Consider creating custom triggers for your industry-specific use cases.",
  ];

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 flex items-center gap-[8px] text-[15px] font-bold text-[#0f172a]">
        AI Category Insights
        <span className="rounded-[6px] bg-[#f3e9ff] px-[7px] py-[2px] text-[11px] font-semibold text-[#7c3aed]">
          AI
        </span>
      </h2>

      <div className="relative mt-[14px] overflow-hidden rounded-[12px] bg-gradient-to-br from-[#f5f3ff] to-[#ede9fe] p-[16px]">
        <span className="absolute right-[14px] top-[14px] flex size-[38px] items-center justify-center rounded-full bg-gradient-to-br from-[#7c3aed] to-[#5b3df5] text-white">
          <TrendingUp className="size-[19px]" />
        </span>
        <p className="m-0 pr-[46px] text-[14px] font-bold text-[#0f172a]">
          Top Performing Category
        </p>
        <p className="m-0 mt-[6px] text-[13px] leading-[19px] text-[#475569]">
          {topVolume.name} shows the highest signal volume with {topVolume.signals} signals
          across {topVolume.companies} companies.
        </p>
      </div>

      <div className="mt-[16px] flex flex-col gap-[12px]">
        {bullets.map((b) => (
          <div className="flex gap-[10px]" key={b}>
            <span className="mt-[1px] flex size-[18px] shrink-0 items-center justify-center rounded-[6px] bg-[#eef1ff] text-[#5b3df5]">
              <Plus className="size-[12px]" />
            </span>
            <p className="m-0 text-[13px] leading-[19px] text-[#475569]">{b}</p>
          </div>
        ))}
      </div>

      <button className="mt-[18px] flex w-full items-center justify-center gap-[8px] rounded-[10px] border border-[#e0dcff] bg-white py-[10px] text-[13px] font-semibold text-[#5b3df5]" type="button">
        View AI Recommendations
        <ArrowRight className="size-[15px]" />
      </button>
    </section>
  );
}

function QuickActionsCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">Quick Actions</h2>
      <button className="mt-[14px] flex w-full items-center gap-[12px] rounded-[12px] border border-[#eef1f6] p-[12px] text-left transition hover:bg-[#f8fafc]" type="button">
        <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#eef1ff] text-[#5b3df5]">
          <Download className="size-[18px]" />
        </span>
        <span>
          <span className="block text-[14px] font-semibold text-[#0f172a]">
            Import Triggers
          </span>
          <span className="block text-[12px] text-[#94a3b8]">
            Import triggers from templates
          </span>
        </span>
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function TriggerLibraryPage() {
  const [saved, setSaved] = useState<SavedTrigger[]>(() => getTriggers());
  const [triggerStats, setTriggerStats] = useState<Record<string, TriggerStat>>({});
  const [statsData, setStatsData] = useState<SignalStatsOut | null>(null);

  useEffect(() => {
    const workspaceId = getWorkspaceId();
    if (!workspaceId) {
      return;
    }
    listTriggers(workspaceId)
      .then((triggers) => {
        const mapped = triggers.map(toSavedTrigger);
        setSaved(mapped);

        // Real per-trigger match counts, computed from the signals the
        // uploaded Excel actually produced (see trigger_matcher.detect_trigger_events).
        // Tolerant of individual failures (e.g. a localStorage-only trigger
        // with no backend id) - those triggers just keep the "—" placeholder.
        Promise.allSettled(mapped.map((t) => getTriggerEvents(workspaceId, t.id))).then((results) => {
          const next: Record<string, TriggerStat> = {};
          results.forEach((result, i) => {
            if (result.status === "fulfilled") {
              const companies = new Set(result.value.events.map((e) => e.company_id));
              next[mapped[i].id] = { events: result.value.event_count, companies: companies.size };
            }
          });
          setTriggerStats(next);
        });
      })
      .catch(() => {
        // No backend/workspace yet - keep the localStorage fallback.
      });
  }, []);

  useEffect(() => {
    const organisationId = getOrganisationId();
    if (!organisationId) {
      return;
    }
    getSignalStats(organisationId)
      .then((data) => {
        if (data.total > 0) {
          setStatsData(data);
        }
      })
      .catch(() => {
        // No backend/org yet - keep the dummy category numbers.
      });
  }, []);

  const categories = statsData ? buildCategories(realCategoryStats(statsData)) : dummyCategories;
  const summary = buildSummary(statsData);
  const totalSignals = statsData ? statsData.total : categories.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Trigger Intelligence" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar searchPlaceholder="Search companies, triggers, executives..." />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          <LibraryHeader />

          <div className="mt-[22px] grid grid-cols-1 gap-[24px] xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-[20px]">
              <SummaryCards summary={summary} />
              <YourTriggers stats={triggerStats} triggers={saved} />
              <CategoryGrid categories={categories} />
              <DistributionOverview categories={categories} totalSignals={totalSignals} />
            </div>

            <div className="flex flex-col gap-[20px]">
              <CategoryPerformanceCard categories={categories} />
              <AIInsightsCard categories={categories} />
              <QuickActionsCard />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
