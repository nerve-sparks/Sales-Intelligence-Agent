import { Check, ChevronRight, Rocket } from "lucide-react";
import { useState } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { ApiError } from "../../api/client";
import { createTrigger } from "../../api/triggers";
import { getWorkspaceId } from "../../lib/session";
import {
  categoryLabel,
  categoryStyle,
  SIGNAL_CATEGORY_OPTIONS,
} from "../../lib/signalCategories";
import { cn } from "../../lib/cn";

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

/* A trigger is exactly three things on the backend (TriggerDefinition: name +
 * signal_categories[] + min_event_score - see app/models/trigger_definition.py).
 * No priority, no status, no conditions/weights, no actions/notifications -
 * none of that exists in the schema, so this page doesn't pretend to collect it.
 *
 * The old "Signal Types" picker is gone: it offered signal_extractor.py's
 * vocabulary (rfp_published, ceo_change, ...), which the evidence pipeline
 * never produces, so any trigger narrowed by type matched zero events. The
 * score threshold replaces it as the way to make a trigger precise, and it
 * uses the real BuyingEvent.event_score the Lead Score itself is built from. */

/* Thresholds are anchored to the real observed event_score distribution
 * (live data tops out in the mid-40s, since event_score multiplies
 * base_strength by five 0-1 factors) - not a 0-100 guess. */
const SCORE_PRESETS = [
  { value: 0, label: "Any signal", hint: "Every match in the category, including weak mentions" },
  { value: 10, label: "Weak and up", hint: "Filters out only the faintest signals" },
  { value: 20, label: "Moderate and up", hint: "A real, reasonably-sourced event" },
  { value: 30, label: "Strong and up", hint: "Well-sourced, recent, clearly relevant" },
  { value: 40, label: "Very strong only", hint: "Top-tier signals - expect few matches" },
];

function scoreHint(value: number): string {
  const match = [...SCORE_PRESETS].reverse().find((p) => value >= p.value);
  return match ? match.hint : SCORE_PRESETS[0].hint;
}

function scoreLabel(value: number): string {
  const match = [...SCORE_PRESETS].reverse().find((p) => value >= p.value);
  return match ? match.label : SCORE_PRESETS[0].label;
}

function CategoryGrid({ selected, onToggle }: { selected: string[]; onToggle: (category: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-[10px] sm:grid-cols-3">
      {SIGNAL_CATEGORY_OPTIONS.map((key) => {
        const style = categoryStyle(key);
        const Icon = style.icon;
        const isSelected = selected.includes(key);
        return (
          <button
            className={cn(
              "relative flex flex-col items-start gap-[10px] rounded-[12px] border p-[14px] text-left transition",
              isSelected ? "border-[#5b3df5] bg-[#faf8ff]" : "border-[#e9edf5] bg-white hover:border-[#d7dcff]",
            )}
            key={key}
            onClick={() => onToggle(key)}
            type="button"
          >
            {isSelected && (
              <span className="absolute right-[10px] top-[10px] flex size-[18px] items-center justify-center rounded-full bg-[#5b3df5] text-white">
                <Check className="size-[12px]" strokeWidth={3} />
              </span>
            )}
            <span
              className="flex size-[36px] items-center justify-center rounded-[9px]"
              style={{ backgroundColor: style.bg, color: style.color }}
            >
              <Icon className="size-[18px]" />
            </span>
            <span className="text-[13px] font-bold text-[#0f172a]">{categoryLabel(key)}</span>
          </button>
        );
      })}
    </div>
  );
}

function ScoreThreshold({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="flex flex-wrap gap-[8px]">
        {SCORE_PRESETS.map((preset) => (
          <button
            className={cn(
              "rounded-[8px] border px-[12px] py-[6px] text-[12px] font-semibold transition",
              value === preset.value
                ? "border-[#5b3df5] bg-[#eef1ff] text-[#5b3df5]"
                : "border-[#e9edf5] bg-white text-[#475569] hover:border-[#d7dcff]",
            )}
            key={preset.value}
            onClick={() => onChange(preset.value)}
            type="button"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-[14px] flex items-center gap-[14px]">
        <input
          aria-label="Minimum event score"
          className="h-[4px] w-full max-w-[320px] cursor-pointer appearance-none rounded-full bg-[#e9edf5] accent-[#5b3df5]"
          max={50}
          min={0}
          onChange={(e) => onChange(Number(e.target.value))}
          step={1}
          type="range"
          value={value}
        />
        <span className="whitespace-nowrap text-[13px] font-bold text-[#0f172a]">
          {value === 0 ? "no minimum" : `score ${value}+`}
        </span>
      </div>
      <p className="m-0 mt-[8px] text-[12px] text-[#94a3b8]">{scoreHint(value)}</p>
    </div>
  );
}

export function TriggerEditorPage() {
  const [name, setName] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [minScore, setMinScore] = useState(20);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggleCategory = (category: string) => {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  // At least one category is genuinely required now - the matcher treats a
  // trigger with no categories as matching nothing (see
  // trigger_matcher.detect_trigger_events), so allowing an empty save would
  // just create an inert rule.
  const canSave = name.trim().length > 0 && categories.length > 0;

  const save = async () => {
    const workspaceId = getWorkspaceId();
    if (!workspaceId) {
      setSaveError("No workspace found - finish onboarding first.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const trigger = await createTrigger(workspaceId, {
        name: name.trim(),
        signal_categories: categories,
        min_event_score: minScore,
      });
      window.location.href = `/trigger-details?id=${trigger.trigger_id}`;
    } catch (err) {
      setSaveError(err instanceof ApiError ? String(err.detail) : "Could not create trigger.");
      setSaving(false);
    }
  };

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
          <div className="flex flex-col gap-[18px] xl:flex-row xl:items-start xl:justify-between">
            <div>
              <nav className="flex items-center gap-[8px] text-[13px]">
                <a className="text-[#64748b] no-underline hover:text-[#334155]" href="/trigger-library">
                  Trigger Library
                </a>
                <ChevronRight className="size-[14px] text-[#cbd5e1]" />
                <span className="font-semibold text-[#0f172a]">Create Trigger</span>
              </nav>
              <h1 className="m-0 mt-[10px] text-[26px] font-bold text-[#0f172a]">Create Trigger</h1>
              <p className="m-0 mt-[6px] text-[15px] text-[#64748b]">
                A trigger matches real signals by type or category - pick a name and what to watch for.
              </p>
            </div>

            <div className="flex flex-col items-start gap-[10px] xl:items-end">
              <button
                className="flex items-center gap-[8px] rounded-[10px] bg-[#fa5a1e] px-[18px] py-[10px] text-[14px] font-semibold text-white shadow-[0px_10px_20px_-6px_rgba(250,90,30,0.5)] disabled:opacity-60"
                disabled={saving || !canSave}
                onClick={save}
                type="button"
              >
                <Rocket className="size-[16px]" />
                {saving ? "Creating..." : "Create Trigger"}
              </button>
              {saveError && <p className="m-0 text-[12px] font-medium text-[#ef4444]">{saveError}</p>}
            </div>
          </div>

          <div className="mt-[22px] grid grid-cols-1 gap-[24px] xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="flex flex-col gap-[24px] rounded-[16px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
              <div>
                <label className="mb-[8px] block text-[13px] font-semibold text-[#334155]">
                  Trigger Name
                </label>
                <input
                  className="h-[44px] w-full max-w-[420px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] text-[14px] text-[#0f172a] outline-none focus:border-[#c7d2fe]"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Buying Intent Signals"
                  value={name}
                />
              </div>

              <div>
                <label className="mb-[8px] block text-[13px] font-semibold text-[#334155]">
                  Signal Categories <span className="font-normal text-[#94a3b8]">(required)</span>
                </label>
                <p className="m-0 mb-[10px] text-[12px] text-[#94a3b8]">
                  Match any buying event in these categories.
                </p>
                <CategoryGrid onToggle={toggleCategory} selected={categories} />
              </div>

              <div>
                <label className="mb-[8px] block text-[13px] font-semibold text-[#334155]">
                  Minimum Signal Strength
                </label>
                <p className="m-0 mb-[10px] text-[12px] text-[#94a3b8]">
                  Only alert on events scoring at least this much - the same event score the Lead Score is
                  built from, so this trigger stays in step with your scoring.
                </p>
                <ScoreThreshold onChange={setMinScore} value={minScore} />
              </div>
            </section>

            <div className="flex flex-col gap-[20px]">
              <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
                <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">Preview</h2>
                <p className="m-0 mt-[10px] text-[13px] text-[#64748b]">
                  This is exactly what gets saved.
                </p>

                <div className="mt-[14px] flex flex-col gap-[12px]">
                  <div>
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.02em] text-[#94a3b8]">
                      Name
                    </p>
                    <p className="m-0 mt-[3px] text-[14px] font-bold text-[#0f172a]">
                      {name.trim() || "Untitled Trigger"}
                    </p>
                  </div>

                  <div>
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.02em] text-[#94a3b8]">
                      Categories
                    </p>
                    {categories.length === 0 ? (
                      <p className="m-0 mt-[3px] text-[13px] text-[#94a3b8]">None selected</p>
                    ) : (
                      <div className="mt-[6px] flex flex-wrap gap-[6px]">
                        {categories.map((c) => {
                          const style = categoryStyle(c);
                          return (
                            <span
                              className="rounded-[6px] px-[8px] py-[3px] text-[11px] font-semibold"
                              key={c}
                              style={{ backgroundColor: style.bg, color: style.color }}
                            >
                              {categoryLabel(c)}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.02em] text-[#94a3b8]">
                      Minimum Strength
                    </p>
                    <p className="m-0 mt-[3px] text-[14px] font-bold text-[#0f172a]">
                      {minScore === 0 ? "Any score" : `Score ${minScore}+`}
                    </p>
                    <p className="m-0 mt-[2px] text-[12px] text-[#94a3b8]">{scoreLabel(minScore)}</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
