import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Pencil, Trash2, X } from "lucide-react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { cn } from "../../lib/cn";
import { ApiError, BASE_URL } from "../../api/client";
import {
  createIcp,
  deleteIcp,
  listIcps,
  listImportBatches,
  updateIcp,
  type IcpCreate,
  type IcpOut,
  type ImportBatchOut,
} from "../../api/icp";
import { uploadExcel, type ExcelImportStats } from "../../api/icpImports";
import { uploadLogo } from "../../api/uploads";
import {
  createWorkspace,
  listWorkspaces,
  listWorkspaceMembers,
  type MemberOut,
  type WorkspaceOut,
} from "../../api/workspaces";
import { getOrganisation, updateOrganisation, type OrganisationOut } from "../../api/organisations";
import { updateUser } from "../../api/users";
import { auth } from "../../lib/firebase";
import { getOrganisationId, getWorkspaceId, setWorkspaceId } from "../../lib/session";
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

/* Reverse of the parse* helpers: given a stored (min,max), find the preset
 * band it came from so the edit form's dropdown can pre-select it. Returns
 * null when the range doesn't line up with any preset (e.g. a Data-Matched
 * ICP's percentile ranges) - callers show the raw range instead so editing
 * never silently rounds a custom ICP to the nearest band. */
function matchingBand(
  options: string[],
  parse: (band: string) => { min: number | null; max: number | null },
  min: number | null,
  max: number | null,
): string | null {
  if (min === null && max === null) {
    return null;
  }
  return options.find((o) => {
    const r = parse(o);
    return r.min === min && r.max === max;
  }) ?? null;
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

/* Stores the ICP's real persisted shape (industry list + raw min/max
 * numbers), not the dropdown band labels - so editing an ICP whose ranges
 * don't map to a preset band (a Data-Matched ICP) round-trips losslessly.
 * The size/revenue dropdowns are just convenience setters over these
 * numbers. */
type IcpFormState = {
  name: string;
  industries: string[];
  employee_min: number | null;
  employee_max: number | null;
  revenue_min_usd: number | null;
  revenue_max_usd: number | null;
  headquarters_countries: string[];
  technologies: string;
  buying_committee_personas: string[];
  departments: string;
};

const initialFormState: IcpFormState = {
  name: "",
  industries: [],
  employee_min: null,
  employee_max: null,
  revenue_min_usd: null,
  revenue_max_usd: null,
  headquarters_countries: [],
  technologies: "",
  buying_committee_personas: [],
  departments: "",
};

function formFromIcp(icp: IcpOut): IcpFormState {
  return {
    name: icp.name ?? "",
    industries: icp.industries ?? [],
    employee_min: icp.employee_min,
    employee_max: icp.employee_max,
    revenue_min_usd: icp.revenue_min_usd,
    revenue_max_usd: icp.revenue_max_usd,
    headquarters_countries: icp.countries ?? [],
    technologies: (icp.technologies ?? []).join(", "),
    buying_committee_personas: icp.buying_committee_personas ?? [],
    departments: (icp.departments ?? []).join(", "),
  };
}

function payloadFromForm(form: IcpFormState): IcpCreate {
  const csv = (v: string) =>
    v ? v.split(",").map((t) => t.trim()).filter(Boolean) : null;
  return {
    name: form.name || (form.industries[0] ? `${form.industries[0]} ICP` : "Untitled ICP"),
    industries: form.industries.length ? form.industries : null,
    employee_min: form.employee_min,
    employee_max: form.employee_max,
    revenue_min_usd: form.revenue_min_usd,
    revenue_max_usd: form.revenue_max_usd,
    countries: form.headquarters_countries.length ? form.headquarters_countries : null,
    technologies: csv(form.technologies),
    buying_committee_personas: form.buying_committee_personas.length
      ? form.buying_committee_personas
      : null,
    departments: csv(form.departments),
  };
}

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

/* Explicit ICP picker for the Upload Data card itself - the "Your ICPs" pill
 * row above already sets selectedIcpId, but that's a scroll away and easy to
 * lose track of once several ICPs exist. Putting a second, always-visible
 * selector directly beside the Upload button removes any doubt about which
 * ICP a file is about to be scored against; picking here also updates the
 * pill row above (same selectedIcpId state), so the two stay in sync. */
function IcpTargetSelect({
  icps,
  selectedIcpId,
  onChange,
}: {
  icps: IcpOut[];
  selectedIcpId: string;
  onChange: (icpId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = icps.find((i) => i.icp_id === selectedIcpId) ?? null;

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

  if (icps.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-[6px]">
      <label className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.4px] text-[#94a3b8]">
        Uploading to
      </label>
      <div className="relative" ref={rootRef}>
        <button
          className="relative flex h-[36px] w-full min-w-[220px] items-center rounded-[8px] border border-[#005bff] bg-[#eff6ff] pl-[12px] pr-[32px] text-left font-['Inter'] text-[13px] font-bold text-[#005bff] outline-none"
          onClick={() => setOpen((o) => !o)}
          type="button"
        >
          <span className="truncate">{selected?.name || "Untitled ICP"}</span>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-[10px] size-[15px] text-[#005bff]"
            strokeWidth={2}
          />
        </button>

        {open && (
          <div className="absolute right-0 top-[calc(100%+4px)] z-20 max-h-[220px] w-full min-w-[220px] overflow-y-auto rounded-[8px] border border-[#e2e8f0] bg-white py-[4px] shadow-[0px_8px_20px_rgba(15,23,42,0.12)]">
            {icps.map((icp) => (
              <button
                className={`block w-full truncate px-[14px] py-[9px] text-left font-['Inter'] text-[13px] ${
                  icp.icp_id === selectedIcpId
                    ? "bg-[#eef1ff] font-bold text-[#005bff]"
                    : "text-[#0f172a] hover:bg-[#f8fafc]"
                }`}
                key={icp.icp_id}
                onClick={() => {
                  onChange(icp.icp_id);
                  setOpen(false);
                }}
                type="button"
              >
                {icp.name || "Untitled ICP"}
              </button>
            ))}
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
      const { stats } = await uploadExcel(workspaceId, icpId, files);
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
          Scored {uploadedLabel}
        </p>
      )}
    </div>
  );
}

const LOGO_ACCEPT = "image/png,image/jpeg,image/svg+xml";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function OrgLogoUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/svg+xml"].includes(file.type)) {
      setError("Logo must be a PNG, JPG, or SVG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("Logo must be 2MB or smaller.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const { url } = await uploadLogo(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-[8px]">
      <FieldLabel>Company Logo</FieldLabel>
      <input
        accept={LOGO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      <div className="relative flex h-[42px] w-fit items-center gap-[10px] rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] px-[10px]">
        {value ? (
          <img alt="Company logo" className="size-[26px] rounded-full object-cover" src={`${BASE_URL}${value}`} />
        ) : (
          <span className="flex size-[26px] items-center justify-center rounded-full bg-white">
            <img alt="" className="size-[13px]" src={icons.upload} />
          </span>
        )}
        <button
          className="font-['Inter'] text-[12px] font-bold text-[#005bff] disabled:opacity-60"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          {uploading ? "Uploading..." : value ? "Change" : "Upload"}
        </button>
        {value && !uploading && (
          <button
            aria-label="Remove logo"
            className="text-[#94a3b8] hover:text-[#dc2626]"
            onClick={() => {
              onChange("");
              setError(null);
            }}
            type="button"
          >
            <X className="size-[13px]" strokeWidth={2.5} />
          </button>
        )}
      </div>
      {error && <p className="m-0 font-['Inter'] text-[11px] text-[#dc2626]">{error}</p>}
    </div>
  );
}

type OrgFormState = {
  company_name: string;
  website: string;
  legal_business_name: string;
  industry: string;
  headquarters_location: string;
  company_description: string;
  account_logo_url: string;
  designation: string;
};

function orgFormFrom(org: OrganisationOut, me: MemberOut | null): OrgFormState {
  return {
    company_name: org.company_name ?? "",
    website: org.website ?? "",
    legal_business_name: org.legal_business_name ?? "",
    industry: org.industry ?? "",
    headquarters_location: org.headquarters_location ?? "",
    company_description: org.company_description ?? "",
    account_logo_url: org.account_logo_url ?? "",
    designation: me?.designation ?? "",
  };
}

/* Mirrors onboarding's (trimmed) Organization Setup step, so the same real
 * Organisation fields collected once at signup stay editable afterward
 * instead of being locked in forever. Designation lives here in the UI (same
 * placement as onboarding) but is actually a per-person field stored on the
 * caller's own User row - saved separately via updateUser, self-only (see
 * app/controllers/users.py's update). */
function OrganizationPanel({
  organisationId,
  workspaceId,
}: {
  organisationId: string | null;
  workspaceId: string | null;
}) {
  const [org, setOrg] = useState<OrganisationOut | null>(null);
  const [me, setMe] = useState<MemberOut | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<OrgFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organisationId) return;
    getOrganisation(organisationId).then(setOrg).catch(() => setOrg(null));
  }, [organisationId]);

  useEffect(() => {
    if (!workspaceId) return;
    const email = auth.currentUser?.email;
    listWorkspaceMembers(workspaceId)
      .then((members) => setMe(members.find((m) => m.email === email) ?? null))
      .catch(() => setMe(null));
  }, [workspaceId]);

  if (!organisationId || !org) {
    return null;
  }

  const startEdit = () => {
    setForm(orgFormFrom(org, me));
    setError(null);
    setEditing(true);
  };

  const handleFieldChange = <K extends keyof OrgFormState>(field: K, value: OrgFormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateOrganisation(organisationId, {
        company_name: form.company_name,
        website: form.website || null,
        legal_business_name: form.legal_business_name || null,
        industry: form.industry || null,
        headquarters_location: form.headquarters_location || null,
        company_description: form.company_description || null,
        account_logo_url: form.account_logo_url || null,
      });
      setOrg(updated);
      if (me && form.designation !== (me.designation ?? "")) {
        const updatedUser = await updateUser(organisationId, me.user_id, {
          designation: form.designation || null,
        });
        setMe({ ...me, designation: updatedUser.designation });
      }
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not save changes.");
    }
    setSaving(false);
  };

  const rows: [string, string][] = [
    ["Company Name", org.company_name || "—"],
    ["Website", org.website || "—"],
    ["Legal Business Name", org.legal_business_name || "—"],
    ["Industry", org.industry || "—"],
    ["Headquarters Location", org.headquarters_location || "—"],
    ["Your Designation", me?.designation || "—"],
  ];

  return (
    <div className="mb-[20px] rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-[10px]">
          <span className="flex size-[36px] items-center justify-center rounded-[9px] bg-[#eef1ff] text-[#4f46e5]">
            <Building2 className="size-[18px]" />
          </span>
          <div>
            <h2 className="m-0 font-['Inter'] text-[16px] font-bold text-[#0f172a]">Organization</h2>
            <p className="m-0 mt-[2px] font-['Inter'] text-[12px] text-[#64748b]">
              The company profile collected during onboarding.
            </p>
          </div>
        </div>
        {!editing && (
          <button
            className="flex h-[36px] items-center gap-[6px] rounded-[8px] border border-[#e2e8f0] bg-white px-[14px] font-['Inter'] text-[12px] font-bold text-[#334155] hover:bg-[#f1f5f9]"
            onClick={startEdit}
            type="button"
          >
            <Pencil className="size-[13px]" />
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <div className="mt-[14px] grid grid-cols-1 gap-[10px] sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <p className="m-0 font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.4px] text-[#94a3b8]">
                {label}
              </p>
              <p className="m-0 mt-[2px] truncate font-['Inter'] text-[13px] font-medium text-[#0f172a]">{value}</p>
            </div>
          ))}
          {org.company_description && (
            <div className="sm:col-span-2 xl:col-span-3">
              <p className="m-0 font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.4px] text-[#94a3b8]">
                Company Description
              </p>
              <p className="m-0 mt-[2px] font-['Inter'] text-[13px] font-medium leading-[19px] text-[#0f172a]">
                {org.company_description}
              </p>
            </div>
          )}
        </div>
      ) : (
        form && (
          <div className="mt-[16px] flex flex-col gap-[14px]">
            <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2 xl:grid-cols-3">
              <TextField
                icon={icons.workspace}
                label="Company Name"
                onChange={(v) => handleFieldChange("company_name", v)}
                value={form.company_name}
              />
              <TextField
                icon={icons.globe}
                label="Website"
                onChange={(v) => handleFieldChange("website", v)}
                value={form.website}
              />
              <TextField
                icon={icons.workspace}
                label="Legal Business Name"
                onChange={(v) => handleFieldChange("legal_business_name", v)}
                value={form.legal_business_name}
              />
              <TextField
                icon={icons.workspace}
                label="Industry"
                onChange={(v) => handleFieldChange("industry", v)}
                placeholder="e.g. Software"
                value={form.industry}
              />
              <TextField
                icon={icons.globe}
                label="Headquarters Location"
                onChange={(v) => handleFieldChange("headquarters_location", v)}
                value={form.headquarters_location}
              />
              <TextField
                icon={icons.workspace}
                label="Your Designation"
                onChange={(v) => handleFieldChange("designation", v)}
                placeholder="e.g. VP of Sales"
                value={form.designation}
              />
              <OrgLogoUpload onChange={(v) => handleFieldChange("account_logo_url", v)} value={form.account_logo_url} />
            </div>
            <div className="flex flex-col gap-[8px]">
              <FieldLabel>Company Description</FieldLabel>
              <textarea
                className="min-h-[74px] w-full resize-none rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] px-[14px] py-[12px] font-['Inter'] text-[13px] font-normal leading-[20px] text-[#0f172a] outline-none"
                maxLength={500}
                onChange={(e) => handleFieldChange("company_description", e.target.value)}
                value={form.company_description}
              />
            </div>
            {error && <p className="m-0 font-['Inter'] text-[12px] text-[#ef4444]">{error}</p>}
            <div className="flex items-center gap-[8px]">
              <button
                className="h-[36px] rounded-[8px] bg-[#005bff] px-[20px] font-['Inter'] text-[12px] font-bold text-white disabled:opacity-60"
                disabled={saving}
                onClick={save}
                type="button"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                className="h-[36px] rounded-[8px] border border-[#e2e8f0] bg-white px-[16px] font-['Inter'] text-[12px] font-bold text-[#334155]"
                onClick={() => setEditing(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}

/* One Organisation can have many Workspaces (department-level - Sales,
 * Marketing, etc: see Workspace.organisation_id being one-to-many) - the
 * backend and the create/list endpoints already supported this, nothing
 * in the UI ever called them until now. Switching writes the new
 * workspace_id to session (lib/session.ts) and reloads, since every
 * workspace-scoped page on the site (this one included) reads that value
 * fresh on mount rather than through any shared/global state. */
function WorkspacesPanel({ organisationId }: { organisationId: string | null }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceOut[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const currentWorkspaceId = getWorkspaceId();

  const refresh = (orgId: string) => {
    listWorkspaces(orgId)
      .then(setWorkspaces)
      .catch(() => setWorkspaces([]));
  };

  useEffect(() => {
    if (!organisationId) return;
    refresh(organisationId);
  }, [organisationId]);

  if (!organisationId) {
    return null;
  }

  const create = async () => {
    if (!name.trim()) {
      setCreateError("Workspace Name is required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await createWorkspace(organisationId, {
        workspace_name: name.trim(),
        purpose: purpose.trim() || null,
      });
      setName("");
      setPurpose("");
      setShowCreateForm(false);
      refresh(organisationId);
    } catch (err) {
      setCreateError(err instanceof ApiError ? String(err.detail) : "Could not create workspace.");
    }
    setCreating(false);
  };

  const switchTo = (id: string) => {
    if (id === currentWorkspaceId) return;
    setWorkspaceId(id);
    window.location.reload();
  };

  return (
    <div className="mb-[20px] rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-[10px]">
          <span className="flex size-[36px] items-center justify-center rounded-[9px] bg-[#eef1ff] text-[#4f46e5]">
            <Building2 className="size-[18px]" />
          </span>
          <div>
            <h2 className="m-0 font-['Inter'] text-[16px] font-bold text-[#0f172a]">Workspaces</h2>
            <p className="m-0 mt-[2px] font-['Inter'] text-[12px] text-[#64748b]">
              One per department - switch anytime from the Dashboard too.
            </p>
          </div>
        </div>
        <button
          className="h-[36px] rounded-[8px] bg-[#005bff] px-[16px] font-['Inter'] text-[12px] font-bold text-white"
          onClick={() => setShowCreateForm((v) => !v)}
          type="button"
        >
          {showCreateForm ? "Cancel" : "+ New Workspace"}
        </button>
      </div>

      {showCreateForm && (
        <div className="mt-[14px] grid grid-cols-1 gap-[12px] rounded-[10px] border border-[#f1f5f9] bg-[#f8fafc] p-[14px] sm:grid-cols-2">
          <div className="flex flex-col gap-[6px]">
            <label className="font-['Inter'] text-[12px] font-semibold text-[#334155]">Workspace Name</label>
            <input
              className="h-[38px] rounded-[8px] border border-[#e2e8f0] bg-white px-[12px] font-['Inter'] text-[13px] text-[#0f172a] outline-none"
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sales"
              value={name}
            />
          </div>
          <div className="flex flex-col gap-[6px]">
            <label className="font-['Inter'] text-[12px] font-semibold text-[#334155]">
              Department / Purpose
            </label>
            <input
              className="h-[38px] rounded-[8px] border border-[#e2e8f0] bg-white px-[12px] font-['Inter'] text-[13px] text-[#0f172a] outline-none"
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Sales"
              value={purpose}
            />
          </div>
          {createError && (
            <p className="m-0 font-['Inter'] text-[12px] font-medium text-[#ef4444] sm:col-span-2">
              {createError}
            </p>
          )}
          <button
            className="h-[36px] w-fit rounded-[8px] bg-[#005bff] px-[16px] font-['Inter'] text-[12px] font-bold text-white disabled:opacity-60 sm:col-span-2"
            disabled={creating}
            onClick={create}
            type="button"
          >
            {creating ? "Creating..." : "Create Workspace"}
          </button>
        </div>
      )}

      {workspaces.length > 0 && (
        <div className="mt-[14px] flex flex-col gap-[8px]">
          {workspaces.map((w) => (
            <div
              className="flex items-center justify-between rounded-[10px] border border-[#eef1f6] p-[12px]"
              key={w.workspace_id}
            >
              <div>
                <p className="m-0 font-['Inter'] text-[13px] font-bold text-[#0f172a]">{w.workspace_name}</p>
                <p className="m-0 mt-[2px] font-['Inter'] text-[12px] text-[#64748b]">
                  {w.purpose || "No department set"}
                </p>
              </div>
              {w.workspace_id === currentWorkspaceId ? (
                <span className="rounded-[6px] bg-[#e7f8ef] px-[10px] py-[4px] font-['Inter'] text-[11px] font-bold text-[#16a34a]">
                  Active
                </span>
              ) : (
                <button
                  className="h-[32px] rounded-[8px] border border-[#e2e8f0] bg-white px-[12px] font-['Inter'] text-[12px] font-bold text-[#334155]"
                  onClick={() => switchTo(w.workspace_id)}
                  type="button"
                >
                  Switch
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SettingsIcpDataPage() {
  const workspaceId = getWorkspaceId();
  const organisationId = getOrganisationId();
  const [icps, setIcps] = useState<IcpOut[]>([]);
  const [selectedIcpId, setSelectedIcpId] = useState<string>("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  // null = the open form is creating a new ICP; a string = editing that ICP.
  const [editingIcpId, setEditingIcpId] = useState<string | null>(null);
  const [form, setForm] = useState<IcpFormState>(initialFormState);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingIcpId, setDeletingIcpId] = useState<string | null>(null);
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

  const openCreate = () => {
    setEditingIcpId(null);
    setForm(initialFormState);
    setCreateError(null);
    setShowCreateForm(true);
  };

  const openEdit = (icp: IcpOut) => {
    setEditingIcpId(icp.icp_id);
    setForm(formFromIcp(icp));
    setCreateError(null);
    setShowCreateForm(true);
  };

  const closeForm = () => {
    setShowCreateForm(false);
    setEditingIcpId(null);
    setForm(initialFormState);
    setCreateError(null);
  };

  // Create or full-replace update, depending on whether the form was opened
  // via "+ New ICP" (editingIcpId null) or an ICP's "Edit" button.
  const handleSubmitIcp = async () => {
    if (!workspaceId) {
      return;
    }
    setCreating(true);
    setCreateError(null);
    const payload = payloadFromForm(form);
    try {
      if (editingIcpId) {
        const updated = await updateIcp(workspaceId, editingIcpId, payload);
        setIcps((prev) => prev.map((i) => (i.icp_id === updated.icp_id ? updated : i)));
        setSelectedIcpId(updated.icp_id);
      } else {
        const icp = await createIcp(workspaceId, payload);
        setIcps((prev) => [icp, ...prev]);
        setSelectedIcpId(icp.icp_id);
      }
      closeForm();
    } catch (err) {
      setCreateError(err instanceof ApiError ? String(err.detail) : "Something went wrong. Please try again.");
    }
    setCreating(false);
  };

  const handleDeleteIcp = async (icp: IcpOut) => {
    if (!workspaceId) {
      return;
    }
    const confirmed = window.confirm(
      `Delete "${icp.name || "Untitled ICP"}"?\n\nThis also removes this ICP's upload history. ` +
        "Companies, signals and scores from past uploads are organisation-wide and are not affected.",
    );
    if (!confirmed) {
      return;
    }
    setDeletingIcpId(icp.icp_id);
    setCreateError(null);
    try {
      await deleteIcp(workspaceId, icp.icp_id);
      const remaining = icps.filter((i) => i.icp_id !== icp.icp_id);
      setIcps(remaining);
      if (selectedIcpId === icp.icp_id) {
        setSelectedIcpId(remaining.length > 0 ? remaining[0].icp_id : "");
      }
      if (editingIcpId === icp.icp_id) {
        closeForm();
      }
      loadHistory(); // that ICP's history rows were cascade-deleted
    } catch (err) {
      setCreateError(err instanceof ApiError ? String(err.detail) : "Could not delete this ICP.");
    }
    setDeletingIcpId(null);
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

          <OrganizationPanel organisationId={organisationId} workspaceId={workspaceId} />

          <WorkspacesPanel organisationId={organisationId} />

          {!workspaceId ? (
            <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[24px] font-['Inter'] text-[14px] text-[#64748b]">
              No workspace found yet — finish onboarding first.
            </div>
          ) : (
            <div className="flex flex-col gap-[20px]">
              <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="m-0 font-['Inter'] text-[16px] font-bold text-[#0f172a]">Your ICPs</h2>
                  <div className="flex items-center gap-[8px]">
                    <button
                      className="h-[36px] rounded-[8px] bg-[#005bff] px-[16px] font-['Inter'] text-[12px] font-bold text-white"
                      onClick={() => (showCreateForm ? closeForm() : openCreate())}
                      type="button"
                    >
                      {showCreateForm ? "Cancel" : "+ New ICP"}
                    </button>
                  </div>
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
                    <div className="mb-[12px] flex flex-wrap items-center justify-between gap-[10px] border-b border-[#e9edf5] pb-[12px]">
                      <p className="m-0 font-['Inter'] text-[14px] font-bold text-[#0f172a]">
                        {selectedIcp.name || "Untitled ICP"}
                      </p>
                      <div className="flex items-center gap-[8px]">
                        <button
                          className="flex h-[32px] items-center gap-[6px] rounded-[8px] border border-[#e2e8f0] bg-white px-[12px] font-['Inter'] text-[12px] font-bold text-[#334155] hover:bg-[#f1f5f9]"
                          onClick={() => openEdit(selectedIcp)}
                          type="button"
                        >
                          <Pencil className="size-[13px]" />
                          Edit
                        </button>
                        <button
                          className="flex h-[32px] items-center gap-[6px] rounded-[8px] border border-[#fecaca] bg-white px-[12px] font-['Inter'] text-[12px] font-bold text-[#dc2626] hover:bg-[#fef2f2] disabled:opacity-60"
                          disabled={deletingIcpId === selectedIcp.icp_id}
                          onClick={() => handleDeleteIcp(selectedIcp)}
                          type="button"
                        >
                          <Trash2 className="size-[13px]" />
                          {deletingIcpId === selectedIcp.icp_id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
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
                    <p className="m-0 font-['Inter'] text-[14px] font-bold text-[#0f172a]">
                      {editingIcpId ? "Edit ICP" : "New ICP"}
                    </p>
                    <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2 xl:grid-cols-3">
                      <TextField
                        icon={icons.workspace}
                        label="ICP Name"
                        onChange={(v) => handleFieldChange("name", v)}
                        placeholder="e.g. Enterprise Software"
                        value={form.name}
                      />
                      <MultiSelectField
                        icon={icons.workspace}
                        label="Primary Industry"
                        onChange={(v) => handleFieldChange("industries", v)}
                        options={INDUSTRY_OPTIONS}
                        values={form.industries}
                      />
                      <SelectField
                        icon={icons.workspace}
                        label="Company Size (Employees)"
                        onChange={(v) => {
                          const r = parseEmployeeRange(v);
                          setForm((prev) => ({ ...prev, employee_min: r.min, employee_max: r.max }));
                        }}
                        options={COMPANY_SIZE_OPTIONS}
                        value={
                          matchingBand(COMPANY_SIZE_OPTIONS, parseEmployeeRange, form.employee_min, form.employee_max) ??
                          (form.employee_min === null && form.employee_max === null
                            ? ""
                            : formatRange(form.employee_min, form.employee_max, (v) => (v === null ? "" : String(v))))
                        }
                      />
                      <SelectField
                        icon={icons.currency}
                        label="Annual Revenue"
                        onChange={(v) => {
                          const r = parseRevenueRange(v);
                          setForm((prev) => ({ ...prev, revenue_min_usd: r.min, revenue_max_usd: r.max }));
                        }}
                        options={ANNUAL_REVENUE_OPTIONS}
                        value={
                          matchingBand(
                            ANNUAL_REVENUE_OPTIONS,
                            parseRevenueRange,
                            form.revenue_min_usd,
                            form.revenue_max_usd,
                          ) ??
                          (form.revenue_min_usd === null && form.revenue_max_usd === null
                            ? ""
                            : formatRange(form.revenue_min_usd, form.revenue_max_usd, formatMoney))
                        }
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
                    <div className="flex items-center gap-[8px]">
                      <button
                        className="h-[36px] rounded-[8px] bg-[#005bff] px-[20px] font-['Inter'] text-[12px] font-bold text-white disabled:opacity-60"
                        disabled={creating}
                        onClick={handleSubmitIcp}
                        type="button"
                      >
                        {creating
                          ? editingIcpId
                            ? "Saving..."
                            : "Creating..."
                          : editingIcpId
                            ? "Save Changes"
                            : "Create ICP"}
                      </button>
                      <button
                        className="h-[36px] rounded-[8px] border border-[#e2e8f0] bg-white px-[16px] font-['Inter'] text-[12px] font-bold text-[#334155]"
                        onClick={closeForm}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="m-0 font-['Inter'] text-[16px] font-bold text-[#0f172a]">Upload Data</h2>
                    <p className="m-0 mt-[2px] font-['Inter'] text-[13px] text-[#64748b]">
                      {icps.length === 0
                        ? "Create an ICP above first."
                        : "Pick the ICP to score this file against, then upload."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-[10px]">
                    <IcpTargetSelect icps={icps} onChange={setSelectedIcpId} selectedIcpId={selectedIcpId} />
                    <ExcelUploadButton
                      icpId={selectedIcpId || null}
                      onUploadComplete={handleUploadComplete}
                      onUploadStart={() => setUploadStats("uploading")}
                      workspaceId={workspaceId}
                    />
                  </div>
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
