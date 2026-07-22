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
import { getTriggerEvents, getTriggerInsight, listTriggers, type TriggerOut } from "../../api/triggers";
import { getSignalStats, type SignalStatsOut } from "../../api/signals";
import { getOrganisationId, getWorkspaceId } from "../../lib/session";
import {
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

function YourTriggers({
  triggers,
  stats,
  hasAny,
}: {
  triggers: DisplayTrigger[];
  stats: Record<string, TriggerStat>;
  hasAny: boolean;
}) {
  return (
    <div>
      <div className="mb-[14px] flex items-center justify-between gap-[12px]">
        <h2 className="m-0 text-[18px] font-bold text-[#0f172a]">Your Triggers</h2>
        {hasAny && <span className="text-[13px] font-medium text-[#64748b]">{triggers.length} shown</span>}
      </div>

      {triggers.length === 0 ? (
        <div className="flex flex-col items-center gap-[10px] rounded-[16px] border border-dashed border-[#d7dcff] bg-white p-[36px] text-center">
          <p className="m-0 text-[14px] font-semibold text-[#334155]">
            {hasAny ? "No triggers match your search." : "You haven't created any triggers yet."}
          </p>
          {!hasAny && (
            <>
              <p className="m-0 max-w-[420px] text-[13px] text-[#94a3b8]">
                A trigger watches for specific signal categories or types and matches them against the signals your
                uploaded data produces.
              </p>
              <button
                className="mt-[4px] flex items-center gap-[8px] rounded-[10px] bg-[#fa5a1e] px-[18px] py-[10px] text-[14px] font-semibold text-white shadow-[0px_10px_20px_-6px_rgba(250,90,30,0.5)]"
                onClick={() => {
                  window.location.href = "/trigger-editor";
                }}
                type="button"
              >
                <Plus className="size-[17px]" />
                Create Your First Trigger
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-[16px] md:grid-cols-3 xl:grid-cols-5">
          {triggers.map((t) => (
            <TriggerCard key={t.id} stat={stats[t.id] ?? null} trigger={t} />
          ))}
        </div>
      )}
    </div>
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

  const summary = buildSummary(statsData);

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

          <div className="mt-[22px] flex flex-col gap-[24px]">
            <SummaryCards summary={summary} />

            <AIInsightsCard loading={insightLoading} summary={insight} />

            <YourTriggers hasAny={triggers.length > 0} stats={triggerStats} triggers={filteredTriggers} />
          </div>
        </main>
      </div>
    </div>
  );
}
