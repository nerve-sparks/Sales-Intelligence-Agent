import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { cn } from "../../lib/cn";
import { ApiError } from "../../api/client";
import { createIcp, listIcps, listImportBatches, type IcpOut, type ImportBatchOut } from "../../api/icp";
import { uploadExcel, type ExcelImportStats } from "../../api/icpImports";
import { getWorkspaceId } from "../../lib/session";
import uploadIconAsset from "../../assets/figma/onboarding/icons/upload.svg";
import workspaceIconAsset from "../../assets/figma/onboarding/icons/workspace.svg";
import globeIconAsset from "../../assets/figma/onboarding/icons/globe.svg";
import currencyIconAsset from "../../assets/figma/onboarding/icons/currency.svg";

/* Same visual language as OnboardingPage's ICP Generation step, rebuilt for
 * ongoing use rather than a one-time wizard: pick from your existing ICPs
 * (or create a new one), upload ZoomInfo exports against whichever is
 * selected, and see every past upload in a persisted history table (see
 * IcpImportBatch - a real DB table, not derived from Company/Signal/
 * LeadScore, which only ever hold the *result* of an upload).
 *
 * Deliberately self-contained (does not import from OnboardingPage.tsx) so
 * changes here can never regress the onboarding wizard. Fields that have no
 * backend column on IcpProfile (Growth Stage, Business Model, Pain Points,
 * Business Goals in onboarding's version) are dropped - this page only
 * collects criteria that are actually persisted and actually used by
 * icp_filter.filter_companies. */

const pageBackground = "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

const icons = {
  workspace: workspaceIconAsset,
  upload: uploadIconAsset,
  globe: globeIconAsset,
  currency: currencyIconAsset,
};

// Real ZoomInfo "Primary Industry" values, not marketing labels - an
// earlier version of this list used made-up names like "Software & SaaS"
// that never matched any real company (ZoomInfo's actual value is just
// "Software"), silently zeroing out every ICP that used them. Pulled from
// the distinct primary_industry values actually present across ingested
// company data.
const INDUSTRY_OPTIONS = [
  "Business Services",
  "Construction",
  "Education",
  "Energy, Utilities & Waste",
  "Finance",
  "Healthcare Services",
  "Hospitality",
  "Hospitals & Physicians Clinics",
  "Insurance",
  "Manufacturing",
  "Media & Internet",
  "Minerals & Mining",
  "Real Estate",
  "Retail",
  "Software",
  "Telecommunications",
  "Transportation",
];
const COMPANY_SIZE_OPTIONS = ["1 - 10", "11 - 50", "51 - 200", "201 - 500", "501 - 1000", "1000+"];
const ANNUAL_REVENUE_OPTIONS = ["<$1M", "$1M - $10M", "$10M - $50M", "$50M - $100M", "$100M - $250M", "$250M+"];
// Real, distinct Company.country values pulled from actual uploaded data
// (same sourcing approach as INDUSTRY_OPTIONS above) - the previous list
// included "Brazil"/"Japan" (0 real companies in either) and was missing 7
// countries that real data actually has (Russia, Belgium, Ireland, Denmark,
// Singapore, Sweden, Finland, France).
const COUNTRY_OPTIONS = [
  "United States", "Canada", "United Kingdom", "India", "Australia",
  "Germany", "Israel", "Russia", "Belgium", "Ireland", "Denmark",
  "Singapore", "Sweden", "Finland", "France",
];
// Full PERSONA_VALUES from app/models/decision_maker.py - IcpProfile.
// buying_committee_personas has no CHECK constraint of its own, but
// icp_filter.py matches it against DecisionMaker.persona.in_(...), which
// does (decision_maker_persona_check) - the previous list only had 15 of
// the 25 real values, silently making roles like "founder" or "svp"
// unselectable even though real decision-maker rows use them.
const PERSONA_OPTIONS = [
  "chairman", "board_member", "founder", "co_founder", "ceo", "president",
  "coo", "cfo", "cto", "cio", "ciso", "chief_ai_officer", "chief_data_officer",
  "chief_product_officer", "chief_strategy_officer", "chief_revenue_officer",
  "chief_marketing_officer", "chief_sales_officer", "chro", "general_counsel",
  "evp", "svp", "vp_operations", "vp_sales", "director", "managing_director",
  "general_manager",
];

function parseEmployeeRange(band: string): { min: number | null; max: number | null } {
  if (band === "1000+") {
    return { min: 1000, max: null };
  }
  const match = band.match(/(\d+)\s*-\s*(\d+)/);
  return match ? { min: Number(match[1]), max: Number(match[2]) } : { min: null, max: null };
}

function parseRevenueRange(band: string): { min: number | null; max: number | null } {
  const toUsd = (v: string) => Number(v.replace(/[^0-9.]/g, "")) * 1_000_000;
  if (band === "<$1M") {
    return { min: 0, max: 1_000_000 };
  }
  if (band === "$250M+") {
    return { min: 250_000_000, max: null };
  }
  const match = band.match(/\$([\d.]+)M\s*-\s*\$([\d.]+)M/);
  return match ? { min: toUsd(match[1]), max: toUsd(match[2]) } : { min: null, max: null };
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatMoney(value: number | null): string {
  if (value === null) {
    return "";
  }
  return value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}M` : `$${value.toLocaleString()}`;
}

function formatRange(min: number | null, max: number | null, formatter: (v: number | null) => string): string {
  if (min === null && max === null) {
    return "Any";
  }
  if (min !== null && max === null) {
    return `${formatter(min)}+`;
  }
  if (min === null && max !== null) {
    return `Up to ${formatter(max)}`;
  }
  return `${formatter(min)} – ${formatter(max)}`;
}

function formatList(values: string[] | null): string {
  return values && values.length > 0 ? values.join(", ") : "Any";
}

function prettyPersona(value: string): string {
  return value
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

type IcpFormState = {
  name: string;
  industry: string;
  company_size: string;
  annual_revenue: string;
  headquarters_countries: string[];
  technologies: string;
  buying_committee_personas: string[];
  departments: string;
};

const initialFormState: IcpFormState = {
  name: "",
  industry: "",
  company_size: "",
  annual_revenue: "",
  headquarters_countries: [],
  technologies: "",
  buying_committee_personas: [],
  departments: "",
};

function FieldLabel({ children }: { children: string }) {
  return (
    <label className="font-['Inter'] text-[14px] font-semibold leading-[20px] text-[#334155]">
      {children}
    </label>
  );
}

function TextField({
  icon,
  label,
  placeholder,
  value,
  onChange,
}: {
  icon: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-[8px]">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative flex h-[42px] items-center rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc]">
        <img alt="" className="pointer-events-none absolute left-[12px] size-[20px]" src={icon} />
        <input
          className="h-full w-full rounded-[8px] bg-transparent pl-[41px] pr-[17px] font-['Inter'] text-[14px] leading-[20px] text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type="text"
          value={value}
        />
      </div>
    </div>
  );
}

function SelectField({
  icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutsideClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  return (
    <div className="flex flex-col gap-[8px]">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative" ref={rootRef}>
        <button
          className="relative flex h-[42px] w-full items-center rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] pl-[41px] pr-[36px] text-left font-['Inter'] text-[14px] leading-[20px] outline-none"
          onClick={() => setOpen((o) => !o)}
          type="button"
        >
          <img alt="" className="pointer-events-none absolute left-[12px] size-[20px]" src={icon} />
          <span className={value ? "text-[#0f172a]" : "text-[#94a3b8]"}>
            {value || `Select ${label.toLowerCase()}`}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-[12px] size-[17px] text-[#64748b]"
            strokeWidth={2}
          />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-[220px] overflow-y-auto rounded-[8px] border border-[#e2e8f0] bg-white py-[4px] shadow-[0px_8px_20px_rgba(15,23,42,0.12)]">
            {options.map((option) => (
              <button
                className={`block w-full px-[14px] py-[9px] text-left font-['Inter'] text-[14px] leading-[20px] ${
                  option === value ? "bg-[#eef1ff] text-[#4f46e5]" : "text-[#0f172a] hover:bg-[#f8fafc]"
                }`}
                key={option}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MultiSelectField({
  icon,
  label,
  values,
  onChange,
  options,
  humanize,
}: {
  icon: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: string[];
  humanize?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const display = humanize ?? ((v: string) => v);

  useEffect(() => {
    if (!open) return;
    const onOutsideClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  const toggle = (option: string) => {
    onChange(values.includes(option) ? values.filter((v) => v !== option) : [...values, option]);
  };

  return (
    <div className="flex flex-col gap-[8px]">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative" ref={rootRef}>
        <button
          className="relative flex h-[42px] w-full items-center rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] pl-[41px] pr-[36px] text-left font-['Inter'] text-[14px] leading-[20px] outline-none"
          onClick={() => setOpen((o) => !o)}
          type="button"
        >
          <img alt="" className="pointer-events-none absolute left-[12px] size-[20px]" src={icon} />
          <span className={`truncate ${values.length ? "text-[#0f172a]" : "text-[#94a3b8]"}`}>
            {values.length ? values.map(display).join(", ") : `Select ${label.toLowerCase()}`}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-[12px] size-[17px] text-[#64748b]"
            strokeWidth={2}
          />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-[220px] overflow-y-auto rounded-[8px] border border-[#e2e8f0] bg-white py-[4px] shadow-[0px_8px_20px_rgba(15,23,42,0.12)]">
            {options.map((option) => {
              const isSelected = values.includes(option);
              return (
                <button
                  className={`flex w-full items-center gap-[8px] px-[14px] py-[9px] text-left font-['Inter'] text-[14px] leading-[20px] ${
                    isSelected ? "bg-[#eef1ff] text-[#4f46e5]" : "text-[#0f172a] hover:bg-[#f8fafc]"
                  }`}
                  key={option}
                  onClick={() => toggle(option)}
                  type="button"
                >
                  <span
                    className={`flex size-[14px] shrink-0 items-center justify-center rounded-[4px] border ${
                      isSelected ? "border-[#4f46e5] bg-[#4f46e5]" : "border-[#cbd5e1]"
                    }`}
                  >
                    {isSelected && (
                      <Check aria-hidden="true" className="size-[10px] text-white" strokeWidth={3} />
                    )}
                  </span>
                  {display(option)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ExcelUploadButton({
  icpId,
  workspaceId,
  onUploadStart,
  onUploadComplete,
}: {
  icpId: string | null;
  workspaceId: string | null;
  onUploadStart: () => void;
  onUploadComplete: (stats: ExcelImportStats) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedLabel, setUploadedLabel] = useState<string | null>(null);
  const ready = Boolean(icpId && workspaceId);

  const handleFiles = async (files: File[]) => {
    if (!icpId || !workspaceId || files.length === 0) {
      return;
    }
    setUploading(true);
    setError(null);
    onUploadStart();
    try {
      const { blob, stats } = await uploadExcel(workspaceId, icpId, files);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = files.length === 1 ? `scored_${files[0].name}` : `scored_${files.length}_files.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setUploadedLabel(files.length === 1 ? files[0].name : `${files.length} files`);
      onUploadComplete(stats);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Upload failed. Please try again.");
    }
    setUploading(false);
  };

  return (
    <div className="flex flex-col items-end gap-[4px]">
      <div className="flex items-center gap-[8px]">
        <input
          accept=".csv,.xlsx"
          className="hidden"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) {
              handleFiles(files);
            }
            e.target.value = "";
          }}
          ref={fileInputRef}
          type="file"
        />
        <button
          className="flex h-[36px] items-center gap-[7px] rounded-[8px] border border-[#e2e8f0] bg-white px-[16px] font-['Inter'] text-[12px] font-bold text-[#0f1f6f] disabled:opacity-50"
          disabled={!ready || uploading}
          onClick={() => fileInputRef.current?.click()}
          title={ready ? "Upload one or more ZoomInfo exports to score against this ICP" : "Select or create an ICP first"}
          type="button"
        >
          <img alt="" className="size-[14px]" src={icons.upload} />
          {uploading ? "Uploading..." : "Upload Excel"}
        </button>
      </div>
      {error && <p className="m-0 font-['Inter'] text-[11px] font-medium text-[#ef4444]">{error}</p>}
      {!error && uploadedLabel && (
        <p className="m-0 font-['Inter'] text-[11px] font-medium text-[#16a34a]">
          Scored {uploadedLabel} - check your downloads
        </p>
      )}
    </div>
  );
}

export function SettingsIcpDataPage() {
  const workspaceId = getWorkspaceId();
  const [icps, setIcps] = useState<IcpOut[]>([]);
  const [selectedIcpId, setSelectedIcpId] = useState<string>("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<IcpFormState>(initialFormState);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportBatchOut[]>([]);
  const [uploadStats, setUploadStats] = useState<"idle" | "uploading" | ExcelImportStats>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadIcps = () => {
    if (!workspaceId) {
      return;
    }
    listIcps(workspaceId)
      .then((data) => {
        setIcps(data);
        setSelectedIcpId((current) => current || (data.length > 0 ? data[0].icp_id : ""));
      })
      .catch(() => setLoadError("Could not load ICPs for this workspace."));
  };

  const loadHistory = () => {
    if (!workspaceId) {
      return;
    }
    listImportBatches(workspaceId)
      .then(setHistory)
      .catch(() => {
        // No history yet, or the fetch failed - leave the list empty rather
        // than blocking the rest of the page.
      });
  };

  useEffect(() => {
    loadIcps();
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFieldChange = <K extends keyof IcpFormState>(field: K, value: IcpFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateIcp = async () => {
    if (!workspaceId) {
      return;
    }
    setCreating(true);
    setCreateError(null);
    const employees = parseEmployeeRange(form.company_size);
    const revenue = parseRevenueRange(form.annual_revenue);
    try {
      const icp = await createIcp(workspaceId, {
        name: form.name || (form.industry ? `${form.industry} ICP` : "Untitled ICP"),
        industries: form.industry ? [form.industry] : null,
        employee_min: employees.min,
        employee_max: employees.max,
        revenue_min_usd: revenue.min,
        revenue_max_usd: revenue.max,
        countries: form.headquarters_countries.length ? form.headquarters_countries : null,
        technologies: form.technologies
          ? form.technologies.split(",").map((t) => t.trim()).filter(Boolean)
          : null,
        buying_committee_personas: form.buying_committee_personas.length
          ? form.buying_committee_personas
          : null,
        departments: form.departments
          ? form.departments.split(",").map((t) => t.trim()).filter(Boolean)
          : null,
      });
      setIcps((prev) => [icp, ...prev]);
      setSelectedIcpId(icp.icp_id);
      setShowCreateForm(false);
      setForm(initialFormState);
    } catch (err) {
      setCreateError(err instanceof ApiError ? String(err.detail) : "Something went wrong. Please try again.");
    }
    setCreating(false);
  };

  const handleUploadComplete = (stats: ExcelImportStats) => {
    setUploadStats(stats);
    loadHistory();
  };

  const selectedIcp = icps.find((i) => i.icp_id === selectedIcpId) ?? null;

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Settings" />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          searchPlaceholder="Search ICPs, uploads..."
          showDetection={false}
          showNotificationBell={false}
        />
        <main className="flex-1 px-[32px] py-[28px]">
          <div className="mb-[24px]">
            <h1 className="m-0 font-['Inter'] text-[24px] font-bold leading-[32px] text-[#0f172a]">
              ICP &amp; Data Management
            </h1>
            <p className="m-0 mt-[4px] font-['Inter'] text-[14px] text-[#64748b]">
              Create or select an Ideal Customer Profile, upload ZoomInfo exports to score against it, and review
              every past upload.
            </p>
          </div>

          {!workspaceId ? (
            <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[24px] font-['Inter'] text-[14px] text-[#64748b]">
              No workspace found yet — finish onboarding first.
            </div>
          ) : (
            <div className="flex flex-col gap-[20px]">
              <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="m-0 font-['Inter'] text-[16px] font-bold text-[#0f172a]">Your ICPs</h2>
                  <button
                    className="h-[36px] rounded-[8px] bg-[#005bff] px-[16px] font-['Inter'] text-[12px] font-bold text-white"
                    onClick={() => setShowCreateForm((v) => !v)}
                    type="button"
                  >
                    {showCreateForm ? "Cancel" : "+ New ICP"}
                  </button>
                </div>

                {icps.length > 0 && !showCreateForm && (
                  <div className="mt-[14px] flex flex-wrap gap-[8px]">
                    {icps.map((icp) => (
                      <button
                        className={cn(
                          "rounded-[8px] border px-[14px] py-[8px] font-['Inter'] text-[13px] font-semibold",
                          icp.icp_id === selectedIcpId
                            ? "border-[#005bff] bg-[#eff6ff] text-[#005bff]"
                            : "border-[#e2e8f0] bg-white text-[#334155]",
                        )}
                        key={icp.icp_id}
                        onClick={() => setSelectedIcpId(icp.icp_id)}
                        type="button"
                      >
                        {icp.name || "Untitled ICP"}
                      </button>
                    ))}
                  </div>
                )}

                {icps.length === 0 && !showCreateForm && (
                  <p className="m-0 mt-[14px] font-['Inter'] text-[13px] text-[#64748b]">
                    No ICPs yet — create one to start uploading and scoring data.
                  </p>
                )}

                {selectedIcp && !showCreateForm && (
                  <div className="mt-[14px] rounded-[10px] border border-[#f1f5f9] bg-[#f8fafc] p-[14px]">
                    <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2 xl:grid-cols-4">
                      {(
                        [
                          ["Industries", formatList(selectedIcp.industries)],
                          [
                            "Company Size",
                            formatRange(selectedIcp.employee_min, selectedIcp.employee_max, (v) =>
                              v === null ? "" : String(v),
                            ),
                          ],
                          [
                            "Annual Revenue",
                            formatRange(selectedIcp.revenue_min_usd, selectedIcp.revenue_max_usd, formatMoney),
                          ],
                          ["Countries", formatList(selectedIcp.countries)],
                          ["Technologies", formatList(selectedIcp.technologies)],
                          [
                            "Buying Committee",
                            formatList(selectedIcp.buying_committee_personas?.map(prettyPersona) ?? null),
                          ],
                          ["Departments", formatList(selectedIcp.departments)],
                          ["Created", formatDate(selectedIcp.created_at)],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label}>
                          <p className="m-0 font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.4px] text-[#94a3b8]">
                            {label}
                          </p>
                          <p className="m-0 mt-[2px] font-['Inter'] text-[13px] font-medium text-[#0f172a]">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {loadError && (
                  <p className="m-0 mt-[10px] font-['Inter'] text-[12px] text-[#ef4444]">{loadError}</p>
                )}

                {showCreateForm && (
                  <div className="mt-[16px] flex flex-col gap-[14px]">
                    <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2 xl:grid-cols-3">
                      <TextField
                        icon={icons.workspace}
                        label="ICP Name"
                        onChange={(v) => handleFieldChange("name", v)}
                        placeholder="e.g. Enterprise Software"
                        value={form.name}
                      />
                      <SelectField
                        icon={icons.workspace}
                        label="Primary Industry"
                        onChange={(v) => handleFieldChange("industry", v)}
                        options={INDUSTRY_OPTIONS}
                        value={form.industry}
                      />
                      <SelectField
                        icon={icons.workspace}
                        label="Company Size (Employees)"
                        onChange={(v) => handleFieldChange("company_size", v)}
                        options={COMPANY_SIZE_OPTIONS}
                        value={form.company_size}
                      />
                      <SelectField
                        icon={icons.currency}
                        label="Annual Revenue"
                        onChange={(v) => handleFieldChange("annual_revenue", v)}
                        options={ANNUAL_REVENUE_OPTIONS}
                        value={form.annual_revenue}
                      />
                      <MultiSelectField
                        icon={icons.globe}
                        label="Headquarters Location"
                        onChange={(v) => handleFieldChange("headquarters_countries", v)}
                        options={COUNTRY_OPTIONS}
                        values={form.headquarters_countries}
                      />
                      <MultiSelectField
                        humanize={prettyPersona}
                        icon={icons.workspace}
                        label="Buying Committee (Key Roles)"
                        onChange={(v) => handleFieldChange("buying_committee_personas", v)}
                        options={PERSONA_OPTIONS}
                        values={form.buying_committee_personas}
                      />
                      <div className="md:col-span-2">
                        <TextField
                          icon={icons.workspace}
                          label="Technologies Used"
                          onChange={(v) => handleFieldChange("technologies", v)}
                          placeholder="e.g. AWS, Salesforce, HubSpot"
                          value={form.technologies}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <TextField
                          icon={icons.workspace}
                          label="Target Departments"
                          onChange={(v) => handleFieldChange("departments", v)}
                          placeholder="e.g. Sales, Marketing, Customer Support"
                          value={form.departments}
                        />
                      </div>
                    </div>
                    {createError && (
                      <p className="m-0 font-['Inter'] text-[12px] text-[#ef4444]">{createError}</p>
                    )}
                    <div>
                      <button
                        className="h-[36px] rounded-[8px] bg-[#005bff] px-[20px] font-['Inter'] text-[12px] font-bold text-white disabled:opacity-60"
                        disabled={creating}
                        onClick={handleCreateIcp}
                        type="button"
                      >
                        {creating ? "Creating..." : "Create ICP"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="m-0 font-['Inter'] text-[16px] font-bold text-[#0f172a]">Upload Data</h2>
                    <p className="m-0 mt-[2px] font-['Inter'] text-[13px] text-[#64748b]">
                      {selectedIcp ? (
                        <>
                          Scoring against{" "}
                          <span className="font-semibold text-[#0f172a]">
                            {selectedIcp.name || "Untitled ICP"}
                          </span>
                        </>
                      ) : (
                        "Select or create an ICP above first."
                      )}
                    </p>
                  </div>
                  <ExcelUploadButton
                    icpId={selectedIcpId || null}
                    onUploadComplete={handleUploadComplete}
                    onUploadStart={() => setUploadStats("uploading")}
                    workspaceId={workspaceId}
                  />
                </div>

                {uploadStats !== "idle" && (
                  <div className="mt-[16px] grid grid-cols-2 gap-[12px] sm:grid-cols-3 xl:grid-cols-6">
                    {uploadStats === "uploading" ? (
                      <p className="col-span-full m-0 font-['Inter'] text-[13px] text-[#64748b]">
                        Processing upload...
                      </p>
                    ) : (
                      (
                        [
                          ["Files Processed", uploadStats.filesProcessed],
                          ["Companies Ingested", uploadStats.companiesIngested],
                          ["Signals Extracted", uploadStats.signalsExtracted],
                          ["Matched ICP", uploadStats.matchedIcp],
                          ["Active", uploadStats.activeCount],
                          ["Nurture", uploadStats.nurtureCount],
                        ] as const
                      ).map(([label, value]) => (
                        <div className="rounded-[10px] border border-[#f1f5f9] bg-[#f8fafc] p-[12px]" key={label}>
                          <p className="m-0 font-['Inter'] text-[11px] font-semibold text-[#64748b]">{label}</p>
                          <p className="m-0 mt-[2px] font-['Inter'] text-[18px] font-bold text-[#0f172a]">
                            {value}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
                <h2 className="m-0 font-['Inter'] text-[16px] font-bold text-[#0f172a]">Upload History</h2>
                {history.length === 0 ? (
                  <p className="m-0 mt-[10px] font-['Inter'] text-[13px] text-[#64748b]">No uploads yet.</p>
                ) : (
                  <div className="mt-[14px] overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse">
                      <thead>
                        <tr className="text-left">
                          {["Date", "ICP", "Files", "Rows", "Companies", "Signals", "Matched", "Active", "Nurture"].map(
                            (h) => (
                              <th
                                className="px-[8px] py-[8px] font-['Inter'] text-[11px] font-bold text-[#64748b]"
                                key={h}
                              >
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((batch) => (
                          <tr className="border-t border-[#f1f5f9]" key={batch.import_batch_id}>
                            <td className="px-[8px] py-[8px] font-['Inter'] text-[12px] text-[#334155]">
                              {formatDate(batch.created_at)}
                            </td>
                            <td className="px-[8px] py-[8px] font-['Inter'] text-[12px] font-semibold text-[#0f172a]">
                              {batch.icp_name || "—"}
                            </td>
                            <td className="px-[8px] py-[8px] font-['Inter'] text-[12px] text-[#334155]">
                              {batch.files_processed}
                            </td>
                            <td className="px-[8px] py-[8px] font-['Inter'] text-[12px] text-[#334155]">
                              {batch.total_rows}
                            </td>
                            <td className="px-[8px] py-[8px] font-['Inter'] text-[12px] text-[#334155]">
                              {batch.companies_ingested}
                            </td>
                            <td className="px-[8px] py-[8px] font-['Inter'] text-[12px] text-[#334155]">
                              {batch.signals_extracted}
                            </td>
                            <td className="px-[8px] py-[8px] font-['Inter'] text-[12px] text-[#334155]">
                              {batch.matched_icp_count}
                            </td>
                            <td className="px-[8px] py-[8px] font-['Inter'] text-[12px] text-[#16a34a]">
                              {batch.active_count}
                            </td>
                            <td className="px-[8px] py-[8px] font-['Inter'] text-[12px] text-[#f59e0b]">
                              {batch.nurture_count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
