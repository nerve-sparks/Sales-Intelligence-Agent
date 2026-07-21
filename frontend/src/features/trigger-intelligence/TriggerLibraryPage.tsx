import {
  Activity,
  Building2,
  ChevronRight,
  LayoutGrid,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Donut } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";
import { getTriggerEvents, getTriggerInsight, listTriggers, type TriggerOut } from "../../api/triggers";
import { getSignalStats, type SignalStatsOut } from "../../api/signals";
import { getOrganisationId, getWorkspaceId } from "../../lib/session";
import {
  CATEGORY_DESCRIPTIONS,
  categoryLabel,
  categoryStyle,
  SIGNAL_CATEGORY_OPTIONS,
  typeLabel,
} from "../../lib/signalCategories";

/* A trigger is exactly name + signal_types[] + signal_categories[] on the
 * backend (TriggerDefinition) - no status/description/priority column
 * exists, so this display type only carries what's real plus derived
 * labels for the card UI. */
type DisplayTrigger = {
  id: string;
  name: string;
  category: string;
  description: string;
};

function toDisplayTrigger(trigger: TriggerOut): DisplayTrigger {
  const catLabels = (trigger.signal_categories ?? []).map(categoryLabel);
  const typeLabels = (trigger.signal_types ?? []).map(typeLabel);
  return {
    id: trigger.trigger_id,
    name: trigger.name || "Untitled Trigger",
    category: trigger.signal_categories?.[0] || trigger.signal_types?.[0] || "",
    description: [...catLabels, ...typeLabels].join(", ") || "No signal criteria set",
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

const zeroCategoryStats: Record<string, CategoryStat> = Object.fromEntries(
  SIGNAL_CATEGORY_OPTIONS.map((key) => [key, { count: 0, companies: 0, score: 0 }]),
);

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

const zeroCategories = buildCategories(zeroCategoryStats);

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function LibraryHeader({ search, onSearchChange }: { search: string; onSearchChange: (value: string) => void }) {
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
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search your triggers..."
              type="search"
              value={search}
            />
          </div>
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

function buildSummary(data: SignalStatsOut | null): SummaryStat[] {
  const totalSignals = data ? data.total : 0;
  const companies = data ? data.company_count : 0;
  const avgAccuracy = data && data.avg_confidence !== null ? `${Math.round(data.avg_confidence * 100)}%` : "—";
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
    <div className="flex flex-col rounded-[16px] border border-[#eef1f6] bg-white p-[16px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
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
 * picker and the category cards above (signalCategories.CATEGORY_STYLE) -
 * a trigger created for "buying_stage" always renders with the same icon
 * everywhere it appears. No Active/Draft badge - that status doesn't exist
 * on TriggerDefinition, every saved trigger is just a live matching rule. */
function TriggerCard({ trigger, stat }: { trigger: DisplayTrigger; stat: TriggerStat }) {
  const style = categoryStyle(trigger.category);
  const Icon = style.icon;

  return (
    <div
      className="flex cursor-pointer flex-col rounded-[16px] border border-[#eef1f6] bg-white p-[16px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)] transition hover:border-[#d7dcff] hover:shadow-[0px_8px_20px_-8px_rgba(91,61,245,0.25)]"
      onClick={() => {
        window.location.href = `/trigger-details?id=${trigger.id}`;
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
        {trigger.description}
      </p>

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

function YourTriggers({ triggers, stats }: { triggers: DisplayTrigger[]; stats: Record<string, TriggerStat> }) {
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
    </section>
  );
}

/* AI-generated (BridgeLLM, gemini/gemini-2.5-pro - see
 * backend/app/controllers/triggers.py::insight) plain-English read of real
 * category performance + your saved triggers. Falls back to a plain
 * real-numbers sentence server-side if the LLM isn't configured. */
function AIInsightsCard({ summary, loading }: { summary: string | null; loading: boolean }) {
  return (
    <section className="rounded-[16px] border border-[#eee9ff] bg-[#faf8ff] p-[20px]">
      <h2 className="m-0 flex items-center gap-[8px] text-[15px] font-bold text-[#0f172a]">
        <Sparkles className="size-[16px] text-[#7c3aed]" />
        AI Category Insights
      </h2>
      {loading ? (
        <p className="m-0 mt-[14px] text-[13px] text-[#94a3b8]">Generating insight...</p>
      ) : summary ? (
        <p className="m-0 mt-[14px] text-[13px] leading-[19px] text-[#475569]">{summary}</p>
      ) : (
        <p className="m-0 mt-[14px] text-[13px] text-[#94a3b8]">No data yet.</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function TriggerLibraryPage() {
  const [triggers, setTriggers] = useState<DisplayTrigger[]>([]);
  const [triggerStats, setTriggerStats] = useState<Record<string, TriggerStat>>({});
  const [statsData, setStatsData] = useState<SignalStatsOut | null>(null);
  const [search, setSearch] = useState("");
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(true);

  useEffect(() => {
    const workspaceId = getWorkspaceId();
    if (!workspaceId) {
      setInsightLoading(false);
      return;
    }
    listTriggers(workspaceId)
      .then((rows) => {
        const mapped = rows.map(toDisplayTrigger);
        setTriggers(mapped);

        // Real per-trigger match counts, computed from the signals the
        // uploaded Excel actually produced (see trigger_matcher.detect_trigger_events).
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
        // No backend/workspace yet - keep the empty list.
      });
    getTriggerInsight(workspaceId)
      .then((res) => setInsight(res.summary))
      .catch(() => {
        // No backend/workspace yet, or LLM call failed - leave insight null.
      })
      .finally(() => setInsightLoading(false));
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
        // No backend/org yet - keep the zeroed category numbers.
      });
  }, []);

  const categories = statsData ? buildCategories(realCategoryStats(statsData)) : zeroCategories;
  const summary = buildSummary(statsData);
  const totalSignals = statsData ? statsData.total : 0;

  const filteredTriggers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return triggers;
    return triggers.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }, [triggers, search]);

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Trigger Intelligence" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          searchPlaceholder="Search companies, triggers, executives..."
          showDetection={false}
          showNotificationBell={false}
        />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          <LibraryHeader onSearchChange={setSearch} search={search} />

          <div className="mt-[22px] grid grid-cols-1 gap-[24px] xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-[20px]">
              <SummaryCards summary={summary} />
              <YourTriggers stats={triggerStats} triggers={filteredTriggers} />
              <CategoryGrid categories={categories} />
              <DistributionOverview categories={categories} totalSignals={totalSignals} />
            </div>

            <div className="flex flex-col gap-[20px]">
              <CategoryPerformanceCard categories={categories} />
              <AIInsightsCard loading={insightLoading} summary={insight} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
