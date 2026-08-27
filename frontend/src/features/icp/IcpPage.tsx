import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pencil, Plus, Sparkles, Target, Trash2, X } from "lucide-react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { InfoTooltip } from "../../components/ui/InfoTooltip";
import { cn } from "../../lib/cn";
import { ApiError } from "../../api/client";
import {
  createIcp,
  deleteIcp,
  generateLeads,
  getIcpOptions,
  getJobStatus,
  listIcps,
  updateIcp,
  type IcpCreate,
  type IcpOptionsOut,
  type IcpOut,
  type ImportBatchOut,
  type JobStatusOut,
} from "../../api/icp";
import { getWorkspaceId } from "../../lib/session";

/* Ideal Customer Profiles - the workspace's saved definitions of who is worth
 * selling to.
 *
 * An ICP here is a *seed for discovery*: it describes which companies to go
 * find. It is deliberately NOT a filter on scoring and contributes no term to
 * the Lead Score, which stays Buying Evidence + Contact Access - Negative
 * Evidence for every company regardless of ICP. An earlier version of this
 * feature gated scoring on ICP fit and was removed for that reason; see
 * ICP_LEAD_GENERATION_INTENT.md before adding anything score-related here.
 *
 * Picker options come from GET .../icp/options rather than hardcoded lists,
 * because the previous form shipped invented industry labels and a truncated
 * persona list, so criteria silently matched nothing. */

const pageBackground = "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

const COUNTRY_OPTIONS = [
  "United States", "Canada", "United Kingdom", "Ireland", "Germany", "France",
  "Belgium", "Denmark", "Sweden", "Finland", "Russia", "Israel", "India",
  "Singapore", "Australia",
];

const EMPLOYEE_BANDS: { label: string; min: number | null; max: number | null }[] = [
  { label: "Any size", min: null, max: null },
  { label: "1 – 10", min: 1, max: 10 },
  { label: "11 – 50", min: 11, max: 50 },
  { label: "51 – 200", min: 51, max: 200 },
  { label: "201 – 500", min: 201, max: 500 },
  { label: "501 – 1,000", min: 501, max: 1000 },
  { label: "1,000+", min: 1000, max: null },
];

const REVENUE_BANDS: { label: string; min: number | null; max: number | null }[] = [
  { label: "Any revenue", min: null, max: null },
  { label: "Under $1M", min: 0, max: 1_000_000 },
  { label: "$1M – $10M", min: 1_000_000, max: 10_000_000 },
  { label: "$10M – $50M", min: 10_000_000, max: 50_000_000 },
  { label: "$50M – $100M", min: 50_000_000, max: 100_000_000 },
  { label: "$100M – $250M", min: 100_000_000, max: 250_000_000 },
  { label: "$250M+", min: 250_000_000, max: null },
];

function bandLabel(
  bands: { label: string; min: number | null; max: number | null }[],
  min: number | null,
  max: number | null,
): string {
  // Falls back to the raw range when a stored ICP doesn't line up with a
  // preset, so editing never silently rounds it to the nearest band.
  const match = bands.find((b) => b.min === min && b.max === max);
  return match ? match.label : "Custom";
}

function formatMoney(value: number): string {
  return value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(0)}M` : `$${value.toLocaleString()}`;
}

function formatRange(
  min: number | null,
  max: number | null,
  format: (v: number) => string,
  anyLabel: string,
): string {
  if (min === null && max === null) return anyLabel;
  if (min !== null && max === null) return `${format(min)}+`;
  if (min === null && max !== null) return `Up to ${format(max)}`;
  return `${format(min as number)} – ${format(max as number)}`;
}

function prettyPersona(value: string): string {
  return value
    .split("_")
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

/* ── form state ────────────────────────────────────────────────────────── */

type IcpFormState = {
  name: string;
  industries: string[];
  employee_min: number | null;
  employee_max: number | null;
  revenue_min_usd: number | null;
  revenue_max_usd: number | null;
  countries: string[];
  technologies: string;
  buying_committee_personas: string[];
  departments: string[];
};

const emptyForm: IcpFormState = {
  name: "",
  industries: [],
  employee_min: null,
  employee_max: null,
  revenue_min_usd: null,
  revenue_max_usd: null,
  countries: [],
  technologies: "",
  buying_committee_personas: [],
  departments: [],
};

function formFromIcp(icp: IcpOut): IcpFormState {
  return {
    name: icp.name ?? "",
    industries: icp.industries ?? [],
    employee_min: icp.employee_min,
    employee_max: icp.employee_max,
    revenue_min_usd: icp.revenue_min_usd,
    revenue_max_usd: icp.revenue_max_usd,
    countries: icp.countries ?? [],
    technologies: (icp.technologies ?? []).join(", "),
    buying_committee_personas: icp.buying_committee_personas ?? [],
    departments: icp.departments ?? [],
  };
}

function payloadFromForm(form: IcpFormState): IcpCreate {
  const list = (values: string[]) => (values.length > 0 ? values : null);
  const csv = (value: string) => {
    const parts = value.split(",").map((v) => v.trim()).filter(Boolean);
    return parts.length > 0 ? parts : null;
  };
  return {
    name: form.name.trim() || "Untitled ICP",
    industries: list(form.industries),
    employee_min: form.employee_min,
    employee_max: form.employee_max,
    revenue_min_usd: form.revenue_min_usd,
    revenue_max_usd: form.revenue_max_usd,
    countries: list(form.countries),
    technologies: csv(form.technologies),
    buying_committee_personas: list(form.buying_committee_personas),
    departments: list(form.departments),
  };
}

/* ── field primitives ──────────────────────────────────────────────────── */

function FieldLabel({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="flex items-center gap-[6px]">
      <label className="font-['Inter'] text-[13px] font-semibold leading-[20px] text-[#334155]">
        {children}
      </label>
      {hint && <InfoTooltip text={hint} />}
    </div>
  );
}

function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);
  return ref;
}

function MultiSelectField({
  label,
  hint,
  values,
  options,
  placeholder,
  emptyMessage,
  onChange,
}: {
  label: string;
  hint?: string;
  values: string[];
  options: string[];
  placeholder: string;
  emptyMessage?: string;
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));

  const toggle = (option: string) =>
    onChange(values.includes(option) ? values.filter((v) => v !== option) : [...values, option]);

  return (
    <div className="flex flex-col gap-[8px]">
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <div className="relative" ref={ref}>
        <button
          className="flex min-h-[42px] w-full items-center gap-[8px] rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] px-[13px] py-[8px] text-left outline-none"
          disabled={options.length === 0}
          onClick={() => setOpen((o) => !o)}
          type="button"
        >
          <span className="flex flex-1 flex-wrap gap-[6px]">
            {values.length === 0 ? (
              <span className="font-['Inter'] text-[14px] text-[#94a3b8]">
                {options.length === 0 ? (emptyMessage ?? placeholder) : placeholder}
              </span>
            ) : (
              values.map((value) => (
                <span
                  className="flex items-center gap-[5px] rounded-[6px] bg-[#eef1ff] px-[8px] py-[3px] font-['Inter'] text-[12px] font-semibold text-[#4f46e5]"
                  key={value}
                >
                  {value}
                  <X
                    className="size-[12px] cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(values.filter((v) => v !== value));
                    }}
                  />
                </span>
              ))
            )}
          </span>
          <ChevronDown aria-hidden="true" className="size-[16px] shrink-0 text-[#94a3b8]" />
        </button>

        {open && options.length > 0 && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-[240px] overflow-y-auto rounded-[8px] border border-[#e2e8f0] bg-white py-[4px] shadow-[0px_8px_20px_rgba(15,23,42,0.12)]">
            {options.map((option) => {
              const selected = values.includes(option);
              return (
                <button
                  className={cn(
                    "flex w-full items-center gap-[8px] px-[13px] py-[8px] text-left font-['Inter'] text-[13px]",
                    selected ? "bg-[#f5f6ff] font-semibold text-[#4f46e5]" : "text-[#0f172a] hover:bg-[#f8fafc]",
                  )}
                  key={option}
                  onClick={() => toggle(option)}
                  type="button"
                >
                  <span
                    className={cn(
                      "flex size-[15px] shrink-0 items-center justify-center rounded-[4px] border",
                      selected ? "border-[#4f46e5] bg-[#4f46e5]" : "border-[#cbd5e1] bg-white",
                    )}
                  >
                    {selected && (
                      <svg className="size-[9px]" fill="none" stroke="white" strokeWidth={3} viewBox="0 0 12 12">
                        <path d="M1.5 6.5 4.5 9.5 10.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  {option}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function BandSelectField({
  label,
  hint,
  bands,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  bands: { label: string; min: number | null; max: number | null }[];
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const current = bandLabel(bands, min, max);

  return (
    <div className="flex flex-col gap-[8px]">
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <div className="relative" ref={ref}>
        <button
          className="flex h-[42px] w-full items-center justify-between rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] px-[13px] text-left font-['Inter'] text-[14px] text-[#0f172a] outline-none"
          onClick={() => setOpen((o) => !o)}
          type="button"
        >
          {current}
          <ChevronDown aria-hidden="true" className="size-[16px] shrink-0 text-[#94a3b8]" />
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-[240px] overflow-y-auto rounded-[8px] border border-[#e2e8f0] bg-white py-[4px] shadow-[0px_8px_20px_rgba(15,23,42,0.12)]">
            {bands.map((band) => (
              <button
                className={cn(
                  "block w-full px-[13px] py-[8px] text-left font-['Inter'] text-[13px]",
                  band.label === current
                    ? "bg-[#f5f6ff] font-semibold text-[#4f46e5]"
                    : "text-[#0f172a] hover:bg-[#f8fafc]",
                )}
                key={band.label}
                onClick={() => {
                  onChange(band.min, band.max);
                  setOpen(false);
                }}
                type="button"
              >
                {band.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── ICP card ──────────────────────────────────────────────────────────── */

function CriterionRow({ label, value, muted }: { label: string; value: string; muted: boolean }) {
  return (
    <div className="flex items-baseline gap-[8px]">
      <span className="w-[126px] shrink-0 font-['Inter'] text-[12px] font-semibold uppercase tracking-[0.3px] text-[#94a3b8]">
        {label}
      </span>
      <span
        className={cn(
          "font-['Inter'] text-[13px]",
          muted ? "text-[#94a3b8]" : "font-medium text-[#334155]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

const TARGET_OPTIONS = [10, 25, 50, 100];

/* "Find companies" for one ICP.
 *
 * The run itself is slow and inherently uncertain - one LLM pass plus one
 * verification search per candidate - so the button stays busy until the
 * verified companies exist. After that the batch behaves exactly like an
 * upload: the same job polling, the same retry/cancel, the same export. */
function GeneratePanel({
  icp,
  workspaceId,
  onGenerated,
}: {
  icp: IcpOut;
  workspaceId: string | null;
  onGenerated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(25);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<ImportBatchOut | null>(null);
  const [job, setJob] = useState<JobStatusOut | null>(null);

  // Research + scoring continue server-side after the response, so poll the
  // existing job endpoint until it settles rather than leaving the count
  // frozen at "just created".
  useEffect(() => {
    if (!batch || !workspaceId) return;
    let cancelled = false;
    const tick = () => {
      getJobStatus(workspaceId, batch.import_batch_id)
        .then((status) => {
          if (!cancelled) setJob(status);
        })
        .catch(() => {
          /* transient - the next tick retries */
        });
    };
    tick();
    const interval = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [batch, workspaceId]);

  const settled =
    job !== null && ["completed", "partially_completed", "failed", "cancelled"].includes(job.status);

  useEffect(() => {
    if (settled) onGenerated();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  const run = async () => {
    if (!workspaceId) return;
    setRunning(true);
    setError(null);
    setJob(null);
    try {
      const created = await generateLeads(workspaceId, icp.icp_id, target);
      setBatch(created);
      onGenerated();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? String(err.detail)
          : "Generation failed. Please try again.",
      );
    }
    setRunning(false);
  };

  return (
    <div className="mt-[15px] border-t border-[#f1f5f9] pt-[14px]">
      {!open && !batch ? (
        <button
          className="flex h-[34px] items-center gap-[7px] rounded-[8px] border border-[#e2e8f0] bg-white px-[14px] font-['Inter'] text-[12px] font-bold text-[#4f46e5] transition hover:bg-[#f8fafc] disabled:opacity-50"
          disabled={!workspaceId}
          onClick={() => setOpen(true)}
          type="button"
        >
          <Sparkles className="size-[14px]" strokeWidth={2} />
          Find companies
        </button>
      ) : null}

      {open && !batch && (
        <div className="flex flex-col gap-[10px]">
          <div className="flex flex-wrap items-center gap-[8px]">
            <span className="font-['Inter'] text-[12px] font-semibold text-[#334155]">
              How many companies?
            </span>
            {TARGET_OPTIONS.map((option) => (
              <button
                className={cn(
                  "h-[30px] rounded-[7px] border px-[12px] font-['Inter'] text-[12px] font-semibold transition",
                  option === target
                    ? "border-[#4f46e5] bg-[#eef1ff] text-[#4f46e5]"
                    : "border-[#e2e8f0] bg-white text-[#64748b] hover:bg-[#f8fafc]",
                )}
                disabled={running}
                key={option}
                onClick={() => setTarget(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
          <p className="m-0 font-['Inter'] text-[11px] leading-[16px] text-[#94a3b8]">
            Each candidate is checked against live web search before it is saved, so this takes a
            minute and usually returns fewer than requested. Companies found this way have no
            contacts yet, which caps their Lead Score below companies you upload.
          </p>
          <div className="flex items-center gap-[8px]">
            <button
              className="flex h-[34px] items-center gap-[7px] rounded-[8px] bg-[#4f46e5] px-[16px] font-['Inter'] text-[12px] font-bold text-white transition hover:bg-[#4338ca] disabled:opacity-50"
              disabled={running}
              onClick={run}
              type="button"
            >
              <Sparkles className="size-[14px]" strokeWidth={2} />
              {running ? "Finding companies…" : `Find ${target} companies`}
            </button>
            {!running && (
              <button
                className="h-[34px] rounded-[8px] border border-[#e2e8f0] bg-white px-[14px] font-['Inter'] text-[12px] font-bold text-[#334155]"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                type="button"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="m-0 mt-[8px] font-['Inter'] text-[11px] font-medium text-[#ef4444]">{error}</p>
      )}

      {batch && (
        <div className="flex flex-col gap-[6px]">
          <p className="m-0 font-['Inter'] text-[12px] font-semibold text-[#16a34a]">
            Found {batch.companies_ingested} verified compan
            {batch.companies_ingested === 1 ? "y" : "ies"}.
          </p>
          <p className="m-0 font-['Inter'] text-[11px] text-[#64748b]">
            {settled
              ? "Research and scoring finished — see them in the Enterprise List."
              : `Researching and scoring… ${job?.progress_percentage ?? 0}%`}
          </p>
          {batch.processing_warnings?.length ? (
            <ul className="m-0 flex flex-col gap-[2px] pl-[16px] font-['Inter'] text-[11px] text-[#94a3b8]">
              {batch.processing_warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-[2px] flex items-center gap-[10px]">
            <a
              className="font-['Inter'] text-[12px] font-bold text-[#4f46e5] no-underline"
              href={`/enterprise-list?import_batch_id=${batch.import_batch_id}`}
            >
              View these companies →
            </a>
            <button
              className="font-['Inter'] text-[12px] font-semibold text-[#64748b]"
              onClick={() => {
                setBatch(null);
                setJob(null);
                setOpen(false);
              }}
              type="button"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function IcpCard({
  icp,
  workspaceId,
  onEdit,
  onDelete,
  onGenerated,
  deleting,
}: {
  icp: IcpOut;
  workspaceId: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onGenerated: () => void;
  deleting: boolean;
}) {
  const criteria: { label: string; value: string; muted: boolean }[] = [
    {
      label: "Industries",
      value: icp.industries?.length ? icp.industries.join(", ") : "Any",
      muted: !icp.industries?.length,
    },
    {
      label: "Company size",
      value: formatRange(icp.employee_min, icp.employee_max, (v) => v.toLocaleString(), "Any"),
      muted: icp.employee_min === null && icp.employee_max === null,
    },
    {
      label: "Revenue",
      value: formatRange(icp.revenue_min_usd, icp.revenue_max_usd, formatMoney, "Any"),
      muted: icp.revenue_min_usd === null && icp.revenue_max_usd === null,
    },
    {
      label: "Countries",
      value: icp.countries?.length ? icp.countries.join(", ") : "Any",
      muted: !icp.countries?.length,
    },
    {
      label: "Technologies",
      value: icp.technologies?.length ? icp.technologies.join(", ") : "Any",
      muted: !icp.technologies?.length,
    },
    {
      label: "Personas",
      value: icp.buying_committee_personas?.length
        ? icp.buying_committee_personas.map(prettyPersona).join(", ")
        : "Any",
      muted: !icp.buying_committee_personas?.length,
    },
    {
      label: "Departments",
      value: icp.departments?.length ? icp.departments.join(", ") : "Any",
      muted: !icp.departments?.length,
    },
  ];

  return (
    <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-[16px]">
        <div className="flex min-w-0 items-center gap-[11px]">
          <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#eef1ff]">
            <Target className="size-[19px] text-[#4f46e5]" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h3 className="m-0 truncate font-['Inter'] text-[15px] font-bold text-[#0f172a]">
              {icp.name || "Untitled ICP"}
            </h3>
            <p className="m-0 font-['Inter'] text-[12px] text-[#94a3b8]">
              Created {formatDate(icp.created_at)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-[6px]">
          <button
            aria-label={`Edit ${icp.name || "Untitled ICP"}`}
            className="flex size-[32px] items-center justify-center rounded-[8px] border border-[#e2e8f0] bg-white text-[#64748b] transition hover:bg-[#f8fafc] hover:text-[#334155]"
            onClick={onEdit}
            type="button"
          >
            <Pencil className="size-[14px]" strokeWidth={2} />
          </button>
          <button
            aria-label={`Delete ${icp.name || "Untitled ICP"}`}
            className="flex size-[32px] items-center justify-center rounded-[8px] border border-[#e2e8f0] bg-white text-[#64748b] transition hover:border-[#fecaca] hover:bg-[#fef2f2] hover:text-[#ef4444] disabled:opacity-50"
            disabled={deleting}
            onClick={onDelete}
            type="button"
          >
            <Trash2 className="size-[14px]" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="mt-[16px] flex flex-col gap-[7px] border-t border-[#f1f5f9] pt-[15px]">
        {criteria.map((c) => (
          <CriterionRow key={c.label} label={c.label} muted={c.muted} value={c.value} />
        ))}
      </div>

      <GeneratePanel icp={icp} onGenerated={onGenerated} workspaceId={workspaceId} />
    </div>
  );
}

/* ── form ──────────────────────────────────────────────────────────────── */

function IcpForm({
  form,
  options,
  editing,
  saving,
  error,
  onFieldChange,
  onSubmit,
  onCancel,
}: {
  form: IcpFormState;
  options: IcpOptionsOut | null;
  editing: boolean;
  saving: boolean;
  error: string | null;
  onFieldChange: <K extends keyof IcpFormState>(field: K, value: IcpFormState[K]) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 font-['Inter'] text-[16px] font-bold text-[#0f172a]">
          {editing ? "Edit ICP" : "New ICP"}
        </h2>
        <button
          aria-label="Close form"
          className="flex size-[30px] items-center justify-center rounded-[8px] text-[#94a3b8] transition hover:bg-[#f6f7fb] hover:text-[#334155]"
          onClick={onCancel}
          type="button"
        >
          <X className="size-[16px]" strokeWidth={2} />
        </button>
      </div>
      <p className="m-0 mt-[4px] font-['Inter'] text-[13px] text-[#64748b]">
        Every field is optional — leave one blank to place no constraint on it.
      </p>

      <div className="mt-[18px] grid grid-cols-1 gap-[16px] md:grid-cols-2">
        <div className="flex flex-col gap-[8px] md:col-span-2">
          <FieldLabel>ICP Name</FieldLabel>
          <input
            className="h-[42px] w-full rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] px-[13px] font-['Inter'] text-[14px] text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
            onChange={(e) => onFieldChange("name", e.target.value)}
            placeholder="e.g. Mid-market US software"
            type="text"
            value={form.name}
          />
        </div>

        <MultiSelectField
          hint="ZoomInfo's own industry labels, served by the backend so they always match the values in your data."
          label="Industries"
          onChange={(v) => onFieldChange("industries", v)}
          options={options?.industries ?? []}
          placeholder="Any industry"
          values={form.industries}
        />

        <MultiSelectField
          label="Headquarters Countries"
          onChange={(v) => onFieldChange("countries", v)}
          options={COUNTRY_OPTIONS}
          placeholder="Any country"
          values={form.countries}
        />

        <BandSelectField
          bands={EMPLOYEE_BANDS}
          label="Company Size"
          max={form.employee_max}
          min={form.employee_min}
          onChange={(min, max) => {
            onFieldChange("employee_min", min);
            onFieldChange("employee_max", max);
          }}
        />

        <BandSelectField
          bands={REVENUE_BANDS}
          label="Annual Revenue"
          max={form.revenue_max_usd}
          min={form.revenue_min_usd}
          onChange={(min, max) => {
            onFieldChange("revenue_min_usd", min);
            onFieldChange("revenue_max_usd", max);
          }}
        />

        <MultiSelectField
          hint="Seniority tags derived from contact job titles. All 27 recognised values are listed."
          label="Buying Committee Personas"
          onChange={(v) => onFieldChange("buying_committee_personas", v)}
          options={(options?.personas ?? []).map(prettyPersona)}
          placeholder="Any persona"
          values={form.buying_committee_personas.map(prettyPersona)}
        />

        <MultiSelectField
          emptyMessage="No contacts uploaded yet"
          hint="Read from the department labels on your own uploaded contacts, so the options always match your data."
          label="Departments"
          onChange={(v) => onFieldChange("departments", v)}
          options={options?.departments ?? []}
          placeholder="Any department"
          values={form.departments}
        />

        <div className="flex flex-col gap-[8px] md:col-span-2">
          <FieldLabel hint="Free text, comma-separated. Technology data is only populated for companies enriched through ZoomInfo, so this narrows the field more than the others.">
            Technologies
          </FieldLabel>
          <input
            className="h-[42px] w-full rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] px-[13px] font-['Inter'] text-[14px] text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
            onChange={(e) => onFieldChange("technologies", e.target.value)}
            placeholder="e.g. Salesforce, Snowflake, AWS"
            type="text"
            value={form.technologies}
          />
        </div>
      </div>

      {error && (
        <p className="m-0 mt-[14px] font-['Inter'] text-[12px] font-medium text-[#ef4444]">{error}</p>
      )}

      <div className="mt-[20px] flex items-center gap-[10px]">
        <button
          className="flex h-[40px] items-center rounded-[8px] bg-[#fa5a1e] px-[20px] font-['Inter'] text-[13px] font-bold text-white transition hover:bg-[#e14f18] disabled:opacity-50"
          disabled={saving}
          onClick={onSubmit}
          type="button"
        >
          {saving ? "Saving..." : editing ? "Save Changes" : "Create ICP"}
        </button>
        <button
          className="flex h-[40px] items-center rounded-[8px] border border-[#e2e8f0] bg-white px-[20px] font-['Inter'] text-[13px] font-bold text-[#334155] transition hover:bg-[#f8fafc]"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── page ──────────────────────────────────────────────────────────────── */

export function IcpPage() {
  const workspaceId = getWorkspaceId();

  const [icps, setIcps] = useState<IcpOut[]>([]);
  const [options, setOptions] = useState<IcpOptionsOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  // null = the open form is creating; a string = editing that ICP.
  const [editingIcpId, setEditingIcpId] = useState<string | null>(null);
  const [form, setForm] = useState<IcpFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingIcpId, setDeletingIcpId] = useState<string | null>(null);
  // Bumped when a generation run finishes, to re-read the picker options - a
  // run can introduce companies (and later contacts), which is what the
  // department list is derived from.
  const [generationTick, setGenerationTick] = useState(0);

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      setLoadError("No workspace selected. Finish onboarding first.");
      return;
    }
    let cancelled = false;
    Promise.all([listIcps(workspaceId), getIcpOptions(workspaceId)])
      .then(([icpRows, optionRows]) => {
        if (cancelled) return;
        setIcps(icpRows);
        setOptions(optionRows);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load ICPs for this workspace.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, generationTick]);

  const handleFieldChange = <K extends keyof IcpFormState>(field: K, value: IcpFormState[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const openCreate = () => {
    setEditingIcpId(null);
    setForm(emptyForm);
    setSaveError(null);
    setFormOpen(true);
  };

  const openEdit = (icp: IcpOut) => {
    setEditingIcpId(icp.icp_id);
    setForm(formFromIcp(icp));
    setSaveError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingIcpId(null);
    setForm(emptyForm);
    setSaveError(null);
  };

  const handleSubmit = async () => {
    if (!workspaceId) return;
    setSaving(true);
    setSaveError(null);
    // Personas are shown prettified but stored as the backend's enum values,
    // so map the selection back before sending.
    const personaByLabel = new Map((options?.personas ?? []).map((p) => [prettyPersona(p), p]));
    const payload = payloadFromForm({
      ...form,
      buying_committee_personas: form.buying_committee_personas.map(
        (label) => personaByLabel.get(label) ?? label,
      ),
    });
    try {
      if (editingIcpId) {
        const updated = await updateIcp(workspaceId, editingIcpId, payload);
        setIcps((prev) => prev.map((i) => (i.icp_id === updated.icp_id ? updated : i)));
      } else {
        const created = await createIcp(workspaceId, payload);
        setIcps((prev) => [created, ...prev]);
      }
      closeForm();
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? String(err.detail) : "Something went wrong. Please try again.",
      );
    }
    setSaving(false);
  };

  const handleDelete = async (icp: IcpOut) => {
    if (!workspaceId) return;
    const confirmed = window.confirm(
      `Delete "${icp.name || "Untitled ICP"}"?\n\n` +
        "Your uploaded companies, buying events and scores are not affected — " +
        "they belong to the organisation, not to this ICP.",
    );
    if (!confirmed) return;

    setDeletingIcpId(icp.icp_id);
    setLoadError(null);
    try {
      await deleteIcp(workspaceId, icp.icp_id);
      setIcps((prev) => prev.filter((i) => i.icp_id !== icp.icp_id));
      if (editingIcpId === icp.icp_id) closeForm();
    } catch (err) {
      setLoadError(err instanceof ApiError ? String(err.detail) : "Could not delete this ICP.");
    }
    setDeletingIcpId(null);
  };

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="ICP" />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar showDetection={false} showNotificationBell={false} />
        <main className="flex-1 px-[32px] py-[28px]">
          <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-[20px]">
            <div className="flex flex-wrap items-start justify-between gap-[16px]">
              <div>
                <h1 className="m-0 font-['Inter'] text-[22px] font-bold text-[#0f172a]">
                  Ideal Customer Profiles
                </h1>
                <p className="m-0 mt-[4px] max-w-[640px] font-['Inter'] text-[14px] text-[#64748b]">
                  Define who you sell to. An ICP describes which companies are worth finding — it
                  never changes how any company is scored.
                </p>
              </div>
              {!formOpen && (
                <button
                  className="flex h-[40px] shrink-0 items-center gap-[7px] rounded-[8px] bg-[#fa5a1e] px-[18px] font-['Inter'] text-[13px] font-bold text-white transition hover:bg-[#e14f18] disabled:opacity-50"
                  disabled={!workspaceId}
                  onClick={openCreate}
                  type="button"
                >
                  <Plus className="size-[15px]" strokeWidth={2.5} />
                  New ICP
                </button>
              )}
            </div>

            {loadError && (
              <div className="rounded-[12px] border border-[#fecaca] bg-[#fef2f2] px-[16px] py-[12px] font-['Inter'] text-[13px] font-medium text-[#b91c1c]">
                {loadError}
              </div>
            )}

            {formOpen && (
              <IcpForm
                editing={editingIcpId !== null}
                error={saveError}
                form={form}
                onCancel={closeForm}
                onFieldChange={handleFieldChange}
                onSubmit={handleSubmit}
                options={options}
                saving={saving}
              />
            )}

            {loading ? (
              <p className="m-0 font-['Inter'] text-[14px] text-[#64748b]">Loading ICPs…</p>
            ) : icps.length === 0 ? (
              !formOpen && (
                <div className="flex flex-col items-center rounded-[16px] border border-dashed border-[#d9e0ec] bg-white/60 px-[24px] py-[52px] text-center">
                  <span className="flex size-[46px] items-center justify-center rounded-[12px] bg-[#eef1ff]">
                    <Target className="size-[22px] text-[#4f46e5]" strokeWidth={2} />
                  </span>
                  <h2 className="m-0 mt-[14px] font-['Inter'] text-[16px] font-bold text-[#0f172a]">
                    No ICPs yet
                  </h2>
                  <p className="m-0 mt-[5px] max-w-[420px] font-['Inter'] text-[13px] text-[#64748b]">
                    Create your first Ideal Customer Profile to describe the companies worth
                    targeting in this workspace.
                  </p>
                  <button
                    className="mt-[18px] flex h-[38px] items-center gap-[7px] rounded-[8px] bg-[#fa5a1e] px-[18px] font-['Inter'] text-[13px] font-bold text-white transition hover:bg-[#e14f18] disabled:opacity-50"
                    disabled={!workspaceId}
                    onClick={openCreate}
                    type="button"
                  >
                    <Plus className="size-[15px]" strokeWidth={2.5} />
                    New ICP
                  </button>
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 gap-[16px] xl:grid-cols-2">
                {icps.map((icp) => (
                  <IcpCard
                    deleting={deletingIcpId === icp.icp_id}
                    icp={icp}
                    key={icp.icp_id}
                    onDelete={() => handleDelete(icp)}
                    onEdit={() => openEdit(icp)}
                    onGenerated={() => setGenerationTick((t) => t + 1)}
                    workspaceId={workspaceId}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
