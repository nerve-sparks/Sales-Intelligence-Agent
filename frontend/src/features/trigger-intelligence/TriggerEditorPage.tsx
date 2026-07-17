import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Eye,
  Factory,
  Lightbulb,
  Mail,
  Play,
  Plus,
  Rocket,
  Save,
  Slack,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState, type ComponentType } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { addTrigger } from "../../lib/triggers";
import { createTrigger } from "../../api/triggers";
import { getWorkspaceId } from "../../lib/session";
import { categoryLabel, categoryStyle, SIGNAL_CATEGORY_OPTIONS } from "../../lib/signalCategories";

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

type IconType = ComponentType<{ className?: string }>;
type ActionRow = { icon: IconType; label: string; target: string };

function SelectBox({ icon: Icon, label }: { icon?: IconType; label: string }) {
  return (
    <button
      className="flex h-[44px] w-full items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] text-[14px] text-[#0f172a]"
      type="button"
    >
      {Icon && <Icon className="size-[17px] text-[#5b3df5]" />}
      <span className="flex-1 truncate text-left">{label}</span>
      <ChevronDown className="size-[16px] text-[#94a3b8]" />
    </button>
  );
}

/* Icon swatch mirrors the same signalCategories.CATEGORY_STYLE used on the
 * Trigger Library's category and trigger cards, so the category a user
 * picks here shows up with the identical icon/color there. */
function CategorySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const style = categoryStyle(value);
  const Icon = style.icon;
  return (
    <div className="relative flex h-[44px] w-full items-center gap-[10px] rounded-[10px] border border-[#e9edf5] bg-white pl-[10px] pr-[14px] text-[14px] text-[#0f172a]">
      <span
        className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px]"
        style={{ backgroundColor: style.bg, color: style.color }}
      >
        <Icon className="size-[15px]" />
      </span>
      <select
        className="h-full w-full appearance-none bg-transparent pr-[20px] outline-none"
        onChange={(e) => onChange(e.target.value)}
        value={value}
      >
        {SIGNAL_CATEGORY_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {categoryLabel(option)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-[14px] size-[16px] text-[#94a3b8]" />
    </div>
  );
}

export function TriggerEditorPage() {
  const [name, setName] = useState("Hiring Spike Detected");
  const [description, setDescription] = useState(
    "Detects hiring spikes for target roles in key accounts",
  );
  const [category, setCategory] = useState<string>(SIGNAL_CATEGORY_OPTIONS[1]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actions, setActions] = useState<ActionRow[]>([
    { icon: Mail, label: "Send Email Notification", target: "Sales Team" },
    { icon: Slack, label: "Send Slack Alert", target: "#sales-alerts" },
    { icon: Cloud, label: "Create Salesforce Task", target: "Follow up with account" },
  ]);

  const save = async (status: "active" | "draft") => {
    const triggerName = name.trim() || "Untitled Trigger";
    const workspaceId = getWorkspaceId();

    // status ("active"/"draft") and the notification actions (email/Slack/
    // Salesforce) have no backend model yet - LLM/notification wiring was
    // explicitly deferred earlier in this project. Persist what the backend
    // can actually act on (name + signal_categories); keep the localStorage
    // save too so Trigger Library always has something to show even if the
    // API call fails or no workspace exists yet.
    addTrigger({
      id: String(Date.now()),
      name: triggerName,
      category,
      description: description.trim(),
      status,
    });

    if (workspaceId) {
      setSaving(true);
      setSaveError(null);
      try {
        await createTrigger(workspaceId, {
          name: triggerName,
          signal_categories: [category],
        });
      } catch {
        setSaveError("Saved locally, but couldn't reach the backend.");
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    window.location.href = "/trigger-library";
  };

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Trigger Intelligence" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar searchPlaceholder="Search companies, triggers, executives..." />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          {/* Header */}
          <div className="flex flex-col gap-[18px] xl:flex-row xl:items-start xl:justify-between">
            <div>
              <nav className="flex items-center gap-[8px] text-[13px]">
                <a className="text-[#64748b] no-underline hover:text-[#334155]" href="/trigger-library">
                  Trigger Library
                </a>
                <ChevronRight className="size-[14px] text-[#cbd5e1]" />
                <span className="font-semibold text-[#0f172a]">Create Trigger</span>
              </nav>
              <div className="mt-[10px] flex flex-wrap items-center gap-[12px]">
                <h1 className="m-0 text-[26px] font-bold text-[#0f172a]">Trigger Editor</h1>
                <span className="rounded-[7px] bg-[#f3e9ff] px-[10px] py-[4px] text-[12px] font-semibold text-[#7c3aed]">
                  New Trigger
                </span>
              </div>
              <p className="m-0 mt-[6px] text-[15px] font-medium text-[#5b3df5]">
                Build smart triggers that identify intent and drive action.
              </p>
            </div>

            <div className="flex flex-col items-start gap-[10px] xl:items-end">
              <div className="flex flex-wrap items-center gap-[10px]">
                <button
                  className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-semibold text-[#334155] disabled:opacity-60"
                  disabled={saving}
                  onClick={() => save("draft")}
                  type="button"
                >
                  <Save className="size-[16px] text-[#64748b]" />
                  Save as Draft
                </button>
                <button
                  className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-semibold text-[#334155]"
                  type="button"
                >
                  <Play className="size-[16px] text-[#5b3df5]" />
                  Test Trigger
                </button>
                <button
                  className="flex items-center gap-[8px] rounded-[10px] bg-[#fa5a1e] px-[18px] py-[10px] text-[14px] font-semibold text-white shadow-[0px_10px_20px_-6px_rgba(250,90,30,0.5)] disabled:opacity-60"
                  disabled={saving}
                  onClick={() => save("active")}
                  type="button"
                >
                  <Rocket className="size-[16px]" />
                  {saving ? "Saving..." : "Activate Trigger"}
                </button>
              </div>
              {saveError && <p className="m-0 text-[12px] font-medium text-[#ef4444]">{saveError}</p>}
            </div>
          </div>

          {/* Body */}
          <div className="mt-[22px] grid grid-cols-1 gap-[24px] xl:grid-cols-[minmax(0,1fr)_360px]">
            {/* Editor card */}
            <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
              <div className="grid grid-cols-1 gap-[20px] md:grid-cols-3">
                <div>
                  <label className="mb-[8px] block text-[13px] font-semibold text-[#334155]">
                    Trigger Name
                  </label>
                  <input
                    className="h-[44px] w-full rounded-[10px] border border-[#e9edf5] bg-white px-[14px] text-[14px] text-[#0f172a] outline-none focus:border-[#c7d2fe]"
                    onChange={(e) => setName(e.target.value)}
                    value={name}
                  />
                </div>
                <div>
                  <label className="mb-[8px] block text-[13px] font-semibold text-[#334155]">
                    Trigger Category
                  </label>
                  <CategorySelect onChange={setCategory} value={category} />
                </div>
                <div>
                  <label className="mb-[8px] block text-[13px] font-semibold text-[#334155]">
                    Description <span className="font-normal text-[#94a3b8]">(Optional)</span>
                  </label>
                  <input
                    className="h-[44px] w-full rounded-[10px] border border-[#e9edf5] bg-white px-[14px] text-[14px] text-[#0f172a] outline-none focus:border-[#c7d2fe]"
                    maxLength={120}
                    onChange={(e) => setDescription(e.target.value)}
                    value={description}
                  />
                  <p className="m-0 mt-[6px] text-right text-[12px] text-[#94a3b8]">
                    {description.length}/120
                  </p>
                </div>
              </div>

              <div className="mt-[16px] flex gap-[24px] border-b border-[#e9edf5]">
                <button className="-mb-px border-b-2 border-[#5b3df5] pb-[12px] text-[14px] font-semibold text-[#5b3df5]" type="button">
                  Builder
                </button>
                <button className="-mb-px border-b-2 border-transparent pb-[12px] text-[14px] font-semibold text-[#64748b] hover:text-[#334155]" type="button">
                  Settings
                </button>
              </div>

              {/* Step 1 */}
              <div className="mt-[20px] rounded-[14px] border border-[#eef1f6] p-[20px]">
                <div className="flex items-start gap-[12px]">
                  <span className="flex size-[28px] shrink-0 items-center justify-center rounded-full bg-[#ede9fe] text-[13px] font-bold text-[#7c3aed]">
                    1
                  </span>
                  <div>
                    <h3 className="m-0 text-[15px] font-bold text-[#0f172a]">
                      WHO &amp; WHAT (Organization)
                    </h3>
                    <p className="m-0 mt-[2px] text-[13px] text-[#64748b]">
                      Select the organization and department you want to monitor.
                    </p>
                  </div>
                </div>
                <div className="mt-[16px] grid grid-cols-1 gap-[16px] sm:grid-cols-2">
                  <div>
                    <label className="mb-[8px] block text-[13px] font-medium text-[#475569]">
                      Organization / Industry
                    </label>
                    <SelectBox icon={Factory} label="Manufacturing" />
                  </div>
                  <div>
                    <label className="mb-[8px] block text-[13px] font-medium text-[#475569]">
                      Department
                    </label>
                    <SelectBox label="Human Resources" />
                  </div>
                </div>
              </div>

              {/* AND */}
              <div className="relative flex items-center justify-center py-[12px]">
                <span className="absolute inset-x-0 top-1/2 h-px bg-[#eef1f6]" />
                <span className="relative rounded-full border border-[#e9edf5] bg-white px-[16px] py-[4px] text-[12px] font-bold text-[#64748b]">
                  AND
                </span>
              </div>

              {/* Step 2 */}
              <div className="rounded-[14px] border border-[#eef1f6] p-[20px]">
                <div className="flex items-start gap-[12px]">
                  <span className="flex size-[28px] shrink-0 items-center justify-center rounded-full bg-[#ede9fe] text-[13px] font-bold text-[#7c3aed]">
                    2
                  </span>
                  <div>
                    <h3 className="m-0 text-[15px] font-bold text-[#0f172a]">THEN (Actions)</h3>
                    <p className="m-0 mt-[2px] text-[13px] text-[#64748b]">
                      Define the actions to take when the conditions are met.
                    </p>
                  </div>
                </div>

                <div className="mt-[16px] flex flex-col gap-[12px]">
                  {actions.map((action, index) => {
                    const Icon = action.icon;
                    return (
                      <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-[12px]" key={index}>
                        <button className="flex h-[44px] items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] text-[14px] text-[#0f172a]" type="button">
                          <Icon className="size-[17px] text-[#5b3df5]" />
                          <span className="flex-1 truncate text-left">{action.label}</span>
                          <ChevronDown className="size-[16px] text-[#94a3b8]" />
                        </button>
                        <input
                          className="h-[44px] w-full rounded-[10px] border border-[#e9edf5] bg-white px-[14px] text-[14px] text-[#0f172a] outline-none focus:border-[#c7d2fe]"
                          defaultValue={action.target}
                        />
                        <button
                          aria-label="Remove action"
                          className="flex size-[40px] items-center justify-center rounded-[10px] text-[#94a3b8] transition hover:bg-[#f6f7fb] hover:text-[#ef4444]"
                          onClick={() => setActions((prev) => prev.filter((_, i) => i !== index))}
                          type="button"
                        >
                          <Trash2 className="size-[17px]" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button
                  className="mt-[14px] flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[9px] text-[13px] font-semibold text-[#5b3df5]"
                  onClick={() =>
                    setActions((prev) => [
                      ...prev,
                      { icon: Mail, label: "Send Email Notification", target: "" },
                    ])
                  }
                  type="button"
                >
                  <Plus className="size-[15px]" />
                  Add Action
                </button>
              </div>

              <div className="mt-[20px]">
                <label className="mb-[8px] block text-[13px] font-semibold text-[#334155]">
                  Trigger Priority
                </label>
                <button className="flex h-[44px] w-[240px] max-w-full items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] text-[14px] text-[#0f172a]" type="button">
                  <span className="size-[8px] rounded-full bg-[#ef4444]" />
                  <span className="flex-1 text-left">High</span>
                  <ChevronDown className="size-[16px] text-[#94a3b8]" />
                </button>
              </div>
            </section>

            {/* Right rail */}
            <div className="flex flex-col gap-[20px]">
              <section className="rounded-[16px] border border-[#eee9ff] bg-[#faf8ff] p-[20px]">
                <h2 className="m-0 flex items-center gap-[8px] text-[15px] font-bold text-[#0f172a]">
                  <Sparkles className="size-[17px] text-[#7c3aed]" />
                  AI Assistant
                  <span className="rounded-[6px] bg-[#ede9fe] px-[7px] py-[2px] text-[11px] font-semibold text-[#7c3aed]">
                    BETA
                  </span>
                </h2>
                <p className="m-0 mt-[14px] text-[14px] font-bold text-[#0f172a]">
                  Trigger Optimization Suggestions
                </p>
                <div className="mt-[12px] flex flex-col gap-[12px]">
                  {[
                    "This trigger is well-structured and should perform well.",
                    "Consider adding intent signals from company news for higher accuracy.",
                    "Accounts with 30%+ hiring spike convert 22% higher.",
                  ].map((s) => (
                    <div className="flex gap-[10px]" key={s}>
                      <CheckCircle2 className="mt-[1px] size-[16px] shrink-0 text-[#16a34a]" />
                      <p className="m-0 text-[13px] leading-[19px] text-[#475569]">{s}</p>
                    </div>
                  ))}
                </div>
                <button className="mt-[16px] flex items-center gap-[8px] rounded-[10px] border border-[#e0dcff] bg-white px-[14px] py-[9px] text-[13px] font-semibold text-[#5b3df5]" type="button">
                  <Sparkles className="size-[15px]" />
                  Apply Suggestions
                </button>
              </section>

              <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
                <h2 className="m-0 flex items-center gap-[8px] text-[15px] font-bold text-[#0f172a]">
                  <Eye className="size-[17px] text-[#5b3df5]" />
                  Trigger Preview
                </h2>
                <p className="m-0 mt-[12px] text-[13px] text-[#64748b]">
                  This trigger will be activated when:
                </p>
                <ul className="m-0 mt-[8px] flex list-none flex-col gap-[8px] p-0">
                  {[
                    "Organization: Manufacturing",
                    "Department: Human Resources",
                    "Conditions and actions match the defined logic",
                  ].map((s) => (
                    <li className="flex gap-[8px] text-[13px] text-[#334155]" key={s}>
                      <span className="mt-[7px] size-[5px] shrink-0 rounded-full bg-[#cbd5e1]" />
                      {s}
                    </li>
                  ))}
                </ul>

                <p className="m-0 mt-[18px] text-[14px] font-bold text-[#0f172a]">
                  Estimated Results (Monthly)
                </p>
                <div className="mt-[12px] grid grid-cols-3 gap-[10px]">
                  {[
                    { label: "Accounts Impacted", value: "120-150", bg: "#f3e9ff", color: "#7c3aed" },
                    { label: "Signals Detected", value: "200-250", bg: "#e7f8ef", color: "#16a34a" },
                    { label: "Engagements", value: "45-60", bg: "#fff1e3", color: "#f97316" },
                  ].map((stat) => (
                    <div className="rounded-[10px] p-[12px]" key={stat.label} style={{ backgroundColor: stat.bg }}>
                      <p className="m-0 text-[11px] font-medium leading-[14px]" style={{ color: stat.color }}>
                        {stat.label}
                      </p>
                      <p className="m-0 mt-[6px] text-[16px] font-bold" style={{ color: stat.color }}>
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[16px] border border-[#eee9ff] bg-[#faf8ff] p-[20px]">
                <h2 className="m-0 flex items-center gap-[8px] text-[15px] font-bold text-[#0f172a]">
                  <Lightbulb className="size-[17px] text-[#f59e0b]" />
                  Trigger Best Practices
                </h2>
                <p className="m-0 mt-[12px] text-[13px] leading-[20px] text-[#475569]">
                  Use specific conditions and avoid too many filters to ensure timely and
                  accurate signal detection.
                </p>
                <button className="mt-[14px] flex items-center gap-[7px] text-[13px] font-semibold text-[#5b3df5]" type="button">
                  View Best Practices
                  <ChevronRight className="size-[15px]" />
                </button>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
