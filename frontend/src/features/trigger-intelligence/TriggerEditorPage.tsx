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
  SIGNAL_TYPES_BY_CATEGORY,
  typeLabel,
} from "../../lib/signalCategories";
import { cn } from "../../lib/cn";

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

/* A trigger is exactly two things on the backend (TriggerDefinition: name +
 * signal_types[] + signal_categories[] - see app/models/trigger_definition.py).
 * No priority, no status, no conditions/weights, no actions/notifications -
 * none of that exists in the schema, so this page doesn't pretend to collect it. */

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

function TypeChips({
  categories,
  selected,
  onToggle,
}: {
  categories: string[];
  selected: string[];
  onToggle: (type: string) => void;
}) {
  const available = categories.flatMap((c) => SIGNAL_TYPES_BY_CATEGORY[c] ?? []);

  if (available.length === 0) {
    return (
      <p className="m-0 text-[13px] text-[#94a3b8]">
        Pick a signal category above to narrow this to specific signal types (optional).
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-[8px]">
      {available.map((type) => {
        const isSelected = selected.includes(type);
        return (
          <button
            className={cn(
              "rounded-[8px] border px-[12px] py-[6px] text-[12px] font-semibold transition",
              isSelected
                ? "border-[#5b3df5] bg-[#eef1ff] text-[#5b3df5]"
                : "border-[#e9edf5] bg-white text-[#475569] hover:border-[#d7dcff]",
            )}
            key={type}
            onClick={() => onToggle(type)}
            type="button"
          >
            {typeLabel(type)}
          </button>
        );
      })}
    </div>
  );
}

export function TriggerEditorPage() {
  const [name, setName] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggleCategory = (category: string) => {
    const isRemoving = categories.includes(category);
    setCategories((prev) => (isRemoving ? prev.filter((c) => c !== category) : [...prev, category]));
    // Dropping a category prunes any of its types that were selected, so the
    // preview never shows a type whose category is no longer checked.
    if (isRemoving) {
      const removedTypes = new Set(SIGNAL_TYPES_BY_CATEGORY[category] ?? []);
      setTypes((prev) => prev.filter((t) => !removedTypes.has(t)));
    }
  };

  const toggleType = (type: string) => {
    setTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  const canSave = name.trim().length > 0 && (categories.length > 0 || types.length > 0);

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
        signal_categories: categories.length ? categories : null,
        signal_types: types.length ? types : null,
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
                  Signal Categories
                </label>
                <p className="m-0 mb-[10px] text-[12px] text-[#94a3b8]">
                  Match any signal in these categories.
                </p>
                <CategoryGrid onToggle={toggleCategory} selected={categories} />
              </div>

              <div>
                <label className="mb-[8px] block text-[13px] font-semibold text-[#334155]">
                  Signal Types <span className="font-normal text-[#94a3b8]">(optional, narrows further)</span>
                </label>
                <TypeChips categories={categories} onToggle={toggleType} selected={types} />
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
                      Types
                    </p>
                    {types.length === 0 ? (
                      <p className="m-0 mt-[3px] text-[13px] text-[#94a3b8]">None selected</p>
                    ) : (
                      <div className="mt-[6px] flex flex-wrap gap-[6px]">
                        {types.map((t) => (
                          <span
                            className="rounded-[6px] bg-[#f1f5f9] px-[8px] py-[3px] text-[11px] font-semibold text-[#334155]"
                            key={t}
                          >
                            {typeLabel(t)}
                          </span>
                        ))}
                      </div>
                    )}
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
