import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Code2,
  BarChart3,
  Building2,
  Database,
  Factory,
  Filter,
  GraduationCap,
  HeartPulse,
  Landmark,
  Mail,
  MoreVertical,
  PlayCircle,
  RadioTower,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Target,
  TrendingUp,
  Upload,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FigmaLogo } from "../auth/LoginPage";
import { ApiError, BASE_URL } from "../../api/client";
import { createOrganisation } from "../../api/organisations";
import { uploadLogo } from "../../api/uploads";
import { addWorkspaceMember, createWorkspace } from "../../api/workspaces";
import { createUser } from "../../api/users";
import {
  setOrganisationId as setSessionOrganisationId,
  setWorkspaceId as setSessionWorkspaceId,
} from "../../lib/session";
import { createIcp, listIcps, listImportBatches, type IcpOut, type ImportBatchOut } from "../../api/icp";
import { createTrigger, listTriggers, type TriggerCreate, type TriggerOut } from "../../api/triggers";
import { uploadExcel } from "../../api/icpImports";
import { useAuth } from "../../lib/useAuth";
import { resolvePostLoginPath } from "../../lib/postLogin";
import goLiveRocketImage from "../../assets/figma/onboarding/go-live-rocket.png";
import heroImage from "../../assets/figma/onboarding/raw-image-1.png";
import arrowRightIcon from "../../assets/figma/onboarding/icons/arrow-right.svg";
import currencyIcon from "../../assets/figma/onboarding/icons/currency.svg";
import globeIcon from "../../assets/figma/onboarding/icons/globe.svg";
import secureIcon from "../../assets/figma/onboarding/icons/secure.svg";
import uploadIcon from "../../assets/figma/onboarding/icons/upload.svg";
import workspaceIcon from "../../assets/figma/onboarding/icons/workspace.svg";

const icons = {
  workspace: workspaceIcon,
  upload: uploadIcon,
  globe: globeIcon,
  currency: currencyIcon,
  secure: secureIcon,
  arrowRight: arrowRightIcon,
};

const pageBackground =
  "linear-gradient(194.759deg, rgb(219, 219, 248) 23.984%, rgb(228, 227, 251) 48.487%), linear-gradient(90deg, rgb(255, 255, 255) 0%, rgb(255, 255, 255) 100%)";

/* Organization Setup + Workspace Setup form state. Organization Setup runs
 * first now (see OnboardingCard) since Workspace.organisation_id requires
 * the Organisation to already exist - and Workspace Setup's Department
 * options depend on the industry chosen in Organization Setup.
 *
 * Backend has a real Organisation <-> Workspace split (one org, many
 * workspaces - see app/models/organisation.py + app/models/workspace.py):
 * - Organisation owns account-level identity (account_name/account_url/
 *   timezone/currency) AND the company profile (company_name/website/
 *   industry/etc) - both collected in Organization Setup, since both are
 *   needed at Organisation-creation time (no PATCH endpoint exists).
 * - Workspace is a separate, department-level entity (workspace_name +
 *   purpose) that ICPs/Triggers actually belong to - collected afterward
 *   in Workspace Setup, once organisationId is available.
 * - A Workspace does NOT belong to one user (WorkspaceMember is a
 *   many-to-many join, several Users can share a Workspace). Workspace
 *   Setup collects the founder's name/email so onboarding creates their
 *   User record and adds them as a WorkspaceMember of the workspace they
 *   just created - onboarding never created any User before this.
 *
 * account_name intentionally derives from company_name (the organisation's
 * real identity), NOT from workspace_name - conflating those was the bug:
 * workspace_name/workspace_purpose name the specific Workspace being
 * created, a different backend concept from the organisation's own account
 * identity.
 *
 * date_format has no backend column, and account_url has a real one - both
 * lost their UI field, so both now stay in state always submitting their
 * initial default, same as sub_industry/founded_year above.
 *
 * Company Size, Annual Revenue, Time in Business, Time Zone and Currency
 * were dropped from Organization Setup entirely (Time in Business never had
 * a backend column at all; the other four are real Organisation columns but
 * are no longer collected here - still editable later from Settings for the
 * ones that are). Industry is now free text instead of a fixed dropdown.
 * designation is new - the founder's job title, collected here but stored
 * on the User row (see app/models/user.py), submitted via createUser in the
 * Workspace Setup step alongside user_full_name/user_email. */
type OnboardingFormState = {
  workspace_name: string;
  workspace_purpose: string;
  user_full_name: string;
  user_email: string;
  designation: string;
  account_url: string;
  account_logo_url: string;
  date_format: string;
  company_name: string;
  website: string;
  legal_business_name: string;
  industry: string;
  sub_industry: string;
  business_type: string;
  headquarters_location: string;
  founded_year: string;
  company_description: string;
};

const initialFormState: OnboardingFormState = {
  workspace_name: "",
  workspace_purpose: "",
  user_full_name: "",
  user_email: "",
  designation: "",
  account_url: "",
  account_logo_url: "",
  date_format: "MM/DD/YYYY",
  company_name: "",
  website: "",
  legal_business_name: "",
  industry: "",
  sub_industry: "",
  business_type: "B2B",
  headquarters_location: "",
  founded_year: "",
  company_description: "",
};

// Still used by ICP Generation's Company Size/Annual Revenue fields further
// below - Organization Setup no longer has its own Company Size/Annual
// Revenue dropdowns.
const COMPANY_SIZE_OPTIONS = ["1 - 10", "11 - 50", "51 - 200", "201 - 500", "501 - 1000", "1000+"];
const ANNUAL_REVENUE_OPTIONS = ["<$1M", "$1M - $10M", "$10M - $50M", "$50M - $100M", "$100M - $250M", "$250M+"];
// "Department" (Workspace Setup) maps to Workspace.purpose - a real column
// the onboarding UI never collected before (workspace creation always sent
// purpose: null). Options depend on the industry chosen in Organization
// Setup, same pattern as a real department picker would use.
const DEPARTMENT_OPTIONS_BY_INDUSTRY: Record<string, string[]> = {
  Manufacturing: ["Sales", "Marketing", "Customer Management", "Operations", "Production", "Quality Control", "Supply Chain", "Procurement"],
};
const DEFAULT_DEPARTMENT_OPTIONS = ["Sales", "Marketing", "Customer Success", "Operations", "Product", "Other"];

function getDepartmentOptions(industry: string): string[] {
  return DEPARTMENT_OPTIONS_BY_INDUSTRY[industry] ?? DEFAULT_DEPARTMENT_OPTIONS;
}

function formatMoney(value: number | null): string {
  if (value === null) return "";
  return value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}M` : `$${value.toLocaleString()}`;
}

function formatRange(min: number | null, max: number | null, formatter: (v: number | null) => string): string {
  if (min === null && max === null) return "Any";
  if (min !== null && max === null) return `${formatter(min)}+`;
  if (min === null && max !== null) return `Up to ${formatter(max)}`;
  return `${formatter(min)} – ${formatter(max)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

/* ICP Generation step - maps to POST /workspaces/{workspace_id}/icp
 * (IcpProfile: name/industries/employee_min/max/revenue_min/max_usd/
 * countries/technologies/departments). Growth Stage, Business Model, Pain
 * Points, and Business Goals were removed entirely - none of them have a
 * backend column on IcpProfile, so they were either required-but-discarded
 * or silently discarded on submit. Buying Committee (buying_committee_
 * personas) is intentionally not collected here - still editable later from
 * Settings > ICP Data Management. */
type IcpFormState = {
  industry: string;
  company_size: string;
  annual_revenue: string;
  headquarters_countries: string[];
  technologies: string;
  departments: string[];
};

const initialIcpFormState: IcpFormState = {
  industry: "",
  company_size: "",
  annual_revenue: "",
  headquarters_countries: [],
  technologies: "",
  departments: [],
};

// Real, distinct Company.country values pulled from actual uploaded data
// (same sourcing approach as the industries list above) - the previous list
// included "Brazil"/"Japan" (0 real companies in either) and was missing 7
// countries that real data actually has (Russia, Belgium, Ireland, Denmark,
// Singapore, Sweden, Finland, France).
const ICP_COUNTRY_OPTIONS = [
  "United States", "Canada", "United Kingdom", "India", "Australia",
  "Germany", "Israel", "Russia", "Belgium", "Ireland", "Denmark",
  "Singapore", "Sweden", "Finland", "France",
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

const steps = [
  ["Organization", "Setup"],
  ["Workspace", "Setup"],
  ["Team", "Invitations"],
  ["Data Source", "Setup"],
  ["Trigger", "Generation"],
  ["ICP", "Generation"],
  ["Business", "Discovery"],
  ["Go", "Live"],
];

const invitedMembers = [
  {
    initials: "JS",
    name: "John Smith",
    email: "john.smith@acmetech.com",
    role: "Sales Manager",
    roleClassName: "bg-[#ede9fe] text-[#6d28d9]",
    status: "Accepted",
    statusTone: "accepted",
    avatarClassName: "bg-[#ede9fe] text-[#6d28d9]",
  },
  {
    initials: "SP",
    name: "Sarah Patel",
    email: "sarah.patel@acmetech.com",
    role: "Sales Rep",
    roleClassName: "bg-[#dbeafe] text-[#005bff]",
    status: "Accepted",
    statusTone: "accepted",
    avatarClassName: "bg-[#ccfbf1] text-[#0f766e]",
  },
  {
    initials: "MB",
    name: "Michael Brown",
    email: "michael.brown@acmetech.com",
    role: "Marketing Manager",
    roleClassName: "bg-[#dcfce7] text-[#15803d]",
    status: "Pending",
    statusTone: "pending",
    avatarClassName: "bg-[#ffedd5] text-[#f97316]",
  },
  {
    initials: "ER",
    name: "Emily Rodriguez",
    email: "emily.rodriguez@acmetech.com",
    role: "RevOps",
    roleClassName: "bg-[#f3e8ff] text-[#7c3aed]",
    status: "Pending",
    statusTone: "pending",
    avatarClassName: "bg-[#fce7f3] text-[#db2777]",
  },
  {
    initials: "DK",
    name: "David Kim",
    email: "david.kim@acmetech.com",
    role: "Executive",
    roleClassName: "bg-[#fce7f3] text-[#db2777]",
    status: "Not Sent",
    statusTone: "idle",
    avatarClassName: "bg-[#dbeafe] text-[#2563eb]",
  },
  {
    initials: "LW",
    name: "Lisa Wong",
    email: "lisa.wong@acmetech.com",
    role: "Sales Rep",
    roleClassName: "bg-[#dbeafe] text-[#005bff]",
    status: "Not Sent",
    statusTone: "idle",
    avatarClassName: "bg-[#cffafe] text-[#0284c7]",
  },
];

// title is the real, exact ZoomInfo "Primary Industry" string (used as-is
// for the ICP dropdown below) - the earlier version of this list used
// marketing labels like "Software & SaaS" that never matched any real
// company (ZoomInfo's actual value is just "Software"), silently zeroing
// out every ICP that used them.
const industries = [
  {
    title: "Software",
    text: "Software, SaaS, Cloud Services, AI/ML, and related platforms.",
    icon: Code2,
    selected: true,
    iconClassName: "bg-[#dbeafe] text-[#005bff]",
  },
  {
    title: "Finance",
    text: "Banking, Insurance, FinTech, Investment, and Financial Services.",
    icon: Landmark,
    iconClassName: "bg-[#dcfce7] text-[#16a34a]",
  },
  {
    title: "Hospitals & Physicians Clinics",
    text: "Healthcare, Medical Devices, Pharma, Biotech, and HealthTech.",
    icon: HeartPulse,
    iconClassName: "bg-[#f3e8ff] text-[#7c3aed]",
  },
  {
    title: "Manufacturing",
    text: "Industrial, Automation, Machinery, and Manufacturing.",
    icon: Factory,
    iconClassName: "bg-[#fee2e2] text-[#f75317]",
  },
  {
    title: "Retail",
    text: "Retail, E-commerce, Marketplaces, and Consumer Goods.",
    icon: ShoppingCart,
    iconClassName: "bg-[#fce7f3] text-[#db2777]",
  },
  {
    title: "Business Services",
    text: "IT Services, Consulting, System Integrators, and Managed Services.",
    icon: Code2,
    iconClassName: "bg-[#cffafe] text-[#0891b2]",
  },
  {
    title: "Education",
    text: "E-learning, EdTech, Schools, Universities, and Training.",
    icon: GraduationCap,
    iconClassName: "bg-[#f3e8ff] text-[#9333ea]",
  },
  {
    title: "Real Estate",
    text: "Real Estate, Construction, PropTech, and Facility Management.",
    icon: Landmark,
    iconClassName: "bg-[#dbeafe] text-[#2563eb]",
  },
  {
    title: "Media & Internet",
    text: "Media, Entertainment, Publishing, Gaming, and Streaming.",
    icon: PlayCircle,
    iconClassName: "bg-[#fee2e2] text-[#f75317]",
  },
  {
    title: "Telecommunications",
    text: "Telecommunications, Networking, and Communication Services.",
    icon: RadioTower,
    iconClassName: "bg-[#cffafe] text-[#0891b2]",
  },
  {
    title: "Energy, Utilities & Waste",
    text: "Energy, Oil & Gas, Utilities, Renewable Energy, and Cleantech.",
    icon: Zap,
    iconClassName: "bg-[#fef3c7] text-[#f59e0b]",
  },
];

const dataSources = [
  {
    name: "LinkedIn Sales Navigator",
    description: "Access lead and company data, job changes, and intent signals.",
    logo: "in",
    logoClassName: "bg-[#0a66c2] text-white",
    connected: true,
  },
  {
    name: "Apollo.io",
    description: "Find verified contacts, company data, and buying intent.",
    logo: "A",
    logoClassName: "bg-[#ffb338] text-[#111827]",
    connected: true,
  },
  {
    name: "ZoomInfo",
    description: "Comprehensive company and contact data with intent insights.",
    logo: "Z",
    logoClassName: "bg-[#ef233c] text-white",
    connected: true,
  },
  {
    name: "Crunchbase",
    description: "Company profiles, funding rounds, acquisitions, and news.",
    logo: "cb",
    logoClassName: "bg-[#0b74ff] text-white",
    connected: true,
  },
  {
    name: "News API",
    description: "Real-time news and press releases to detect key events.",
    logo: "N",
    logoClassName: "bg-[#a855f7] text-white",
    connected: true,
  },
  {
    name: "Clearbit",
    description: "Enrich profiles with firmographic and technographic data.",
    logo: "C",
    logoClassName: "bg-[#38bdf8] text-white",
  },
  {
    name: "G2",
    description: "Track product reviews, buyer intent, and competitive signals.",
    logo: "G2",
    logoClassName: "bg-[#ff6b35] text-white",
  },
  {
    name: "Owler",
    description: "Company intelligence, leadership changes, and alerts.",
    logo: "O",
    logoClassName: "bg-[#0f1f6f] text-white",
  },
  {
    name: "Custom API",
    description: "Connect any custom API or internal data source.",
    logo: "API",
    logoClassName: "bg-[#7c3aed] text-white",
  },
];

// Keyed by signal.signal_category (see SIGNAL_CATEGORY_MAP in
// backend/app/services/signal_extractor.py for the real category values) -
// purely a visual treatment, the underlying trigger data is real.
const TRIGGER_CATEGORY_STYLES: Record<string, { icon: typeof Zap; className: string }> = {
  ai_seriousness: { icon: Zap, className: "bg-[#eef2ff] text-[#4f46e5]" },
  ai_pain_points: { icon: Filter, className: "bg-[#fff7ed] text-[#f97316]" },
  budget_and_capital: { icon: Target, className: "bg-[#ede9fe] text-[#7c3aed]" },
  buying_stage: { icon: TrendingUp, className: "bg-[#eff6ff] text-[#005bff]" },
  company_identity: { icon: Building2, className: "bg-[#fce7f3] text-[#db2777]" },
  competitive_context: { icon: RefreshCcw, className: "bg-[#cffafe] text-[#0891b2]" },
  reachability: { icon: Users, className: "bg-[#dcfce7] text-[#16a34a]" },
  urgency_and_catalysts: { icon: RadioTower, className: "bg-[#f3e8ff] text-[#9333ea]" },
};
const DEFAULT_TRIGGER_STYLE = { icon: Zap, className: "bg-[#eef2ff] text-[#4f46e5]" };

function humanizeEnumValue(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/* Real stages of excel_pipeline (see app/services/excel_pipeline.py) - this
 * replaces a mockup "AI is scanning your website/LinkedIn/news" list with
 * what the Excel upload on the ICP step actually does server-side. The
 * first 4 stages complete synchronously (one request); scoring
 * (isScoringStage) now runs as a background task afterward, so it can still
 * be "in progress" after the other 4 have already finished - see
 * AiBusinessDiscoveryForm's scoringDone handling below. */
const DISCOVERY_STAGE_DEFS = [
  {
    name: "Excel File Parsed",
    description: "Reading the uploaded ZoomInfo export row by row",
    icon: Database,
    iconClassName: "bg-[#f3e8ff] text-[#7c3aed]",
    detail: (s: ImportBatchOut) => `${s.total_rows} rows read`,
  },
  {
    name: "Companies & Contacts Ingested",
    description: "Upserting companies and decision-makers into the database",
    icon: Users,
    iconClassName: "bg-[#dbeafe] text-[#005bff]",
    detail: (s: ImportBatchOut) => `${s.companies_ingested} companies saved`,
  },
  {
    name: "Buying Signals Extracted",
    description: "Classifying news and scoop rows into buying signals",
    icon: RadioTower,
    iconClassName: "bg-[#dbeafe] text-[#2563eb]",
    detail: (s: ImportBatchOut) => `${s.signals_extracted} signals extracted`,
  },
  {
    name: "Lead Scores Computed",
    description: "Scoring every company across the 7-dimension model",
    icon: BarChart3,
    iconClassName: "bg-[#fef3c7] text-[#b45309]",
    isScoringStage: true,
    detail: (s: ImportBatchOut) => `${s.active_count} active, ${s.nurture_count} nurture`,
  },
  {
    name: "ICP Filtering Applied",
    description: "Matching ingested companies against your ICP criteria in SQL",
    icon: Target,
    iconClassName: "bg-[#eef2ff] text-[#4f46e5]",
    detail: (s: ImportBatchOut) => `${s.matched_icp_count} companies matched your ICP`,
  },
];

const goLiveFeatures = [
  {
    title: "Trigger Intelligence",
    text: "Real-time buying signals and intent triggers are monitoring your market.",
    icon: RadioTower,
    className: "bg-[#eef2ff] text-[#005bff]",
  },
  {
    title: "Prospect Discovery",
    text: "AI-powered discovery of high-intent prospects is ready.",
    icon: Users,
    className: "bg-[#eef2ff] text-[#005bff]",
  },
  {
    title: "Smart Outreach",
    text: "Personalized outreach sequences tailored to your ICP.",
    icon: Target,
    className: "bg-[#faf5ff] text-[#7c3aed]",
  },
  {
    title: "Pipeline & CRM Sync",
    text: "Data is synced with your CRM and ready to track engagement.",
    icon: RefreshCcw,
    className: "bg-[#eef2ff] text-[#005bff]",
  },
  {
    title: "Analytics & Insights",
    text: "Dashboards and reports are set up to measure impact.",
    icon: BarChart3,
    className: "bg-[#eef2ff] text-[#005bff]",
  },
  {
    title: "AI Recommendations",
    text: "AI will continuously learn and recommend the best next actions.",
    icon: Target,
    className: "bg-[#faf5ff] text-[#7c3aed]",
  },
];

const setupSummaryItems = [
  "Workspace Setup",
  "Organization Setup",
  "Team Invitations",
  "Industry Selection",
  "Business Discovery",
  "ICP Generation",
  "Trigger Generation",
  "Data Source Setup",
  "Go Live",
];

function RequiredMark() {
  return <span className="text-[#ef4444]">*</span>;
}

function FieldLabel({
  children,
  required = false,
}: {
  children: string;
  required?: boolean;
}) {
  return (
    <label className="font-['Inter'] text-[14px] font-semibold leading-[20px] text-[#334155]">
      {children} {required && <RequiredMark />}
    </label>
  );
}

type TextFieldProps = {
  icon: string | ReactNode;
  label: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
};

function TextField({ icon, label, required, disabled, placeholder, value, onChange }: TextFieldProps) {
  return (
    <div className="flex flex-col gap-[8px]">
      <FieldLabel required={required}>{label}</FieldLabel>
      <div className="relative flex h-[42px] items-center rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc]">
        {typeof icon === "string" ? (
          <img
            alt=""
            className="pointer-events-none absolute left-[12px] size-[20px]"
            src={icon}
          />
        ) : (
          <span className="pointer-events-none absolute left-[12px] flex size-[20px] items-center justify-center">
            {icon}
          </span>
        )}
        <input
          className="h-full w-full rounded-[8px] bg-transparent pl-[41px] pr-[17px] font-['Inter'] text-[14px] leading-[20px] text-[#0f172a] outline-none placeholder:text-[#94a3b8] disabled:cursor-not-allowed disabled:text-[#94a3b8]"
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type="text"
          value={value}
        />
      </div>
    </div>
  );
}

type SelectFieldProps = {
  icon: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: string[];
};

function SelectField({ icon, label, required, value, onChange, options }: SelectFieldProps) {
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
      <FieldLabel required={required}>{label}</FieldLabel>
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
  required,
  values,
  onChange,
  options,
  humanize,
}: {
  icon: string;
  label: string;
  required?: boolean;
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
      <FieldLabel required={required}>{label}</FieldLabel>
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

const LOGO_ACCEPT = "image/png,image/jpeg,image/svg+xml";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function LogoUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
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
      <div className="relative flex h-[119px] w-full flex-col items-center justify-center rounded-[12px] border-2 border-dashed border-[#e2e8f0] bg-[#f8fafc] px-[34px] py-[20px]">
        {value && !uploading && (
          <button
            aria-label="Remove logo"
            className="absolute right-[10px] top-[10px] flex size-[22px] items-center justify-center rounded-full bg-white text-[#64748b] shadow-[0px_1px_2px_rgba(15,23,42,0.15)] hover:text-[#dc2626]"
            onClick={() => {
              onChange("");
              setError(null);
            }}
            type="button"
          >
            <X className="size-[13px]" strokeWidth={2.5} />
          </button>
        )}
        <button
          className="flex flex-col items-center justify-center disabled:opacity-60"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          {value ? (
            <img
              alt="Company logo"
              className="size-[48px] rounded-full object-cover"
              src={`${BASE_URL}${value}`}
            />
          ) : (
            <span className="flex size-[48px] items-center justify-center rounded-full bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
              <img alt="" className="size-[24px]" src={icons.upload} />
            </span>
          )}
          <span className="mt-[12px] font-['Inter'] text-[14px] font-bold leading-[20px] text-[#4f46e5]">
            {uploading ? "Uploading..." : value ? "Change Logo" : "Upload Logo"}
          </span>
          <span className="mt-[1px] font-['Inter'] text-[11px] font-normal leading-[16.5px] text-[#94a3b8]">
            SVG, PNG or JPG (max. 2MB)
          </span>
        </button>
      </div>
      {error && <p className="m-0 font-['Inter'] text-[11px] text-[#dc2626]">{error}</p>}
      <p className="m-0 pt-[4px] font-['Inter'] text-[11px] italic leading-[16.5px] text-[#94a3b8]">
        Recommended: 512x512px
      </p>
    </div>
  );
}

type StepFormProps = {
  form: OnboardingFormState;
  onFieldChange: <K extends keyof OnboardingFormState>(field: K, value: OnboardingFormState[K]) => void;
};

function OrganizationSetupForm({ form, onFieldChange }: StepFormProps) {
  return (
    <div className="grid grid-cols-1 gap-x-[20px] gap-y-[16px] md:grid-cols-2">
      <TextField
        icon={icons.workspace}
        label="Company Name"
        onChange={(v) => onFieldChange("company_name", v)}
        placeholder="Acme Technologies Inc."
        required
        value={form.company_name}
      />
      <TextField
        icon={icons.globe}
        label="Website"
        onChange={(v) => onFieldChange("website", v)}
        placeholder="https://www.acmetech.com"
        required
        value={form.website}
      />
      <TextField
        icon={icons.workspace}
        label="Legal Business Name"
        onChange={(v) => onFieldChange("legal_business_name", v)}
        placeholder="Acme Technologies Incorporated"
        value={form.legal_business_name}
      />
      <TextField
        icon={icons.workspace}
        label="Industry"
        onChange={(v) => onFieldChange("industry", v)}
        placeholder="e.g. Software"
        required
        value={form.industry}
      />
      <TextField
        icon={icons.globe}
        label="Headquarters Location"
        onChange={(v) => onFieldChange("headquarters_location", v)}
        placeholder="San Francisco, California, USA"
        required
        value={form.headquarters_location}
      />
      <TextField
        icon={icons.workspace}
        label="Designation"
        onChange={(v) => onFieldChange("designation", v)}
        placeholder="e.g. VP of Sales"
        value={form.designation}
      />
      <LogoUpload
        onChange={(v) => onFieldChange("account_logo_url", v)}
        value={form.account_logo_url}
      />

      <div className="flex flex-col gap-[8px] md:col-span-2">
        <FieldLabel>Company Description</FieldLabel>
        <textarea
          className="min-h-[74px] w-full resize-none rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] px-[14px] py-[12px] font-['Inter'] text-[13px] font-normal leading-[20px] text-[#0f172a] outline-none"
          maxLength={500}
          onChange={(e) => onFieldChange("company_description", e.target.value)}
          placeholder="Describe what your company does..."
          value={form.company_description}
        />
      </div>
    </div>
  );
}

function WorkspaceSetupForm({ form, onFieldChange, firebaseEmail }: StepFormProps & { firebaseEmail: string | null }) {
  return (
    <div className="grid grid-cols-1 gap-x-[20px] gap-y-[19px] md:grid-cols-2">
      <TextField
        icon={icons.workspace}
        label="Workspace Name"
        onChange={(v) => onFieldChange("workspace_name", v)}
        placeholder="Enter workspace name"
        value={form.workspace_name}
      />
      <SelectField
        icon={icons.workspace}
        label="Department"
        onChange={(v) => onFieldChange("workspace_purpose", v)}
        options={getDepartmentOptions(form.industry)}
        value={form.workspace_purpose}
      />
      <TextField
        icon={icons.workspace}
        label="Your Name"
        onChange={(v) => onFieldChange("user_full_name", v)}
        placeholder="Enter your full name"
        value={form.user_full_name}
      />
      {/* Locked to the actual logged-in Firebase account, not free-typed -
       * this is the real identity the workspace membership (and the
       * backend's app_user row) gets created under, so it can't drift from
       * whoever is actually signed in. */}
      <TextField
        disabled
        icon={<Mail className="size-[16px] text-[#94a3b8]" />}
        label="Your Email"
        onChange={() => {}}
        placeholder="you@company.com"
        required
        value={firebaseEmail ?? form.user_email}
      />
    </div>
  );
}

function StatusBadge({
  status,
  tone,
}: {
  status: string;
  tone: string;
}) {
  const isAccepted = tone === "accepted";
  const isPending = tone === "pending";

  return (
    <span
      className={`inline-flex items-center gap-[7px] whitespace-nowrap font-['Inter'] text-[12px] font-medium leading-[18px] ${
        isAccepted
          ? "text-[#16a34a]"
          : isPending
            ? "text-[#f75317]"
            : "text-[#64748b]"
      }`}
    >
      {isAccepted ? (
        <CheckCircle2 aria-hidden="true" className="size-[16px]" />
      ) : (
        <Clock3 aria-hidden="true" className="size-[16px]" />
      )}
      {status}
    </span>
  );
}

function TeamInvitationsForm() {
  return (
    <div className="flex flex-col gap-[16px]">
      <div className="grid grid-cols-1 items-end gap-[12px] lg:grid-cols-[1.15fr_1fr_1fr_auto]">
        <div className="flex flex-col gap-[8px]">
          <FieldLabel required>Email Address</FieldLabel>
          <div className="relative flex h-[42px] items-center rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc]">
            <Mail
              aria-hidden="true"
              className="absolute left-[12px] size-[18px] text-[#4f46e5]"
              strokeWidth={2}
            />
            <input
              className="h-full w-full rounded-[8px] bg-transparent pl-[41px] pr-[14px] font-['Inter'] text-[14px] leading-[20px] text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
              placeholder="Enter email address"
              type="email"
            />
          </div>
        </div>
        <div className="flex flex-col gap-[8px]">
          <FieldLabel>Full Name</FieldLabel>
          <div className="relative flex h-[42px] items-center rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc]">
            <User
              aria-hidden="true"
              className="absolute left-[12px] size-[18px] text-[#0f1f6f]"
              strokeWidth={2}
            />
            <input
              className="h-full w-full rounded-[8px] bg-transparent pl-[41px] pr-[14px] font-['Inter'] text-[14px] leading-[20px] text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
              placeholder="Enter full name"
              type="text"
            />
          </div>
        </div>
        <div className="flex flex-col gap-[8px]">
          <FieldLabel required>Role</FieldLabel>
          <button
            className="relative flex h-[42px] w-full items-center rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] pl-[41px] pr-[36px] text-left font-['Inter'] text-[14px] leading-[20px] text-[#64748b]"
            type="button"
          >
            <ShieldCheck
              aria-hidden="true"
              className="absolute left-[12px] size-[18px] text-[#4f46e5]"
              strokeWidth={2}
            />
            <span className="truncate">Select role</span>
            <ChevronDown
              aria-hidden="true"
              className="absolute right-[12px] size-[17px] text-[#0f1f6f]"
              strokeWidth={2}
            />
          </button>
        </div>
        <button
          className="h-[42px] whitespace-nowrap rounded-[8px] border border-[#005bff] bg-white px-[22px] font-['Inter'] text-[14px] font-medium leading-[20px] text-[#005bff]"
          type="button"
        >
          Add to List
        </button>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-[#e2e8f0] bg-white">
        <div className="px-[14px] pb-[8px] pt-[13px]">
          <h3 className="m-0 font-['Inter'] text-[18px] font-bold leading-[27px] text-[#0f1f6f]">
            Invited Members (6)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[660px] border-collapse font-['Inter'] text-[12px] text-[#0f1f6f]">
            <thead>
              <tr className="border-b border-[#e2e8f0] text-left text-[12px] font-medium leading-[18px]">
                <th className="w-[26%] px-[14px] pb-[10px]">Name</th>
                <th className="w-[28%] px-[14px] pb-[10px]">Email</th>
                <th className="w-[19%] px-[14px] pb-[10px]">Role</th>
                <th className="w-[17%] px-[14px] pb-[10px]">Status</th>
                <th className="w-[10%] px-[14px] pb-[10px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitedMembers.map((member) => (
                <tr
                  className="border-b border-[#eef2f7] last:border-b-0"
                  key={member.email}
                >
                  <td className="px-[14px] py-[9px]">
                    <div className="flex items-center gap-[12px]">
                      <span
                        className={`flex size-[32px] shrink-0 items-center justify-center rounded-full font-['Inter'] text-[12px] font-bold ${member.avatarClassName}`}
                      >
                        {member.initials}
                      </span>
                      <span className="whitespace-nowrap font-bold text-[#0f1f6f]">
                        {member.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-[14px] py-[9px] text-[#0f1f6f]">
                    {member.email}
                  </td>
                  <td className="px-[14px] py-[9px]">
                    <span
                      className={`inline-flex rounded-[5px] px-[10px] py-[4px] font-['Inter'] text-[12px] font-medium leading-[16px] ${member.roleClassName}`}
                    >
                      {member.role}
                    </span>
                  </td>
                  <td className="px-[14px] py-[9px]">
                    <StatusBadge
                      status={member.status}
                      tone={member.statusTone}
                    />
                  </td>
                  <td className="px-[14px] py-[9px]">
                    <div className="flex items-center gap-[10px]">
                      {member.status === "Not Sent" && (
                        <button
                          className="font-['Inter'] text-[12px] font-medium text-[#005bff]"
                          type="button"
                        >
                          Resend
                        </button>
                      )}
                      <button
                        aria-label={`More actions for ${member.name}`}
                        className="flex size-[32px] items-center justify-center rounded-[8px] border border-[#e2e8f0] bg-white text-[#0f1f6f]"
                        type="button"
                      >
                        <MoreVertical aria-hidden="true" className="size-[17px]" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-[12px] border border-[#e2e8f0] bg-white px-[14px] py-[12px]">
        <p className="m-0 font-['Inter'] text-[13px] leading-[20px] text-[#0f1f6f]">
          Or invite team members in bulk
        </p>
        <button
          className="mt-[10px] inline-flex h-[40px] items-center gap-[10px] rounded-[8px] border border-[#e2e8f0] bg-white px-[18px] font-['Inter'] text-[13px] font-medium text-[#0f1f6f]"
          type="button"
        >
          <Upload aria-hidden="true" className="size-[17px]" />
          Import from CSV
        </button>
      </div>
    </div>
  );
}

function DataSourceSetupForm() {
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="m-0 font-['Inter'] text-[12px] font-medium leading-[18px] text-[#0f1f6f]">
          Select and connect the data sources you want to use. You can connect
          more anytime.
        </p>
        <div className="flex gap-[8px]">
          <div className="relative h-[36px] w-[190px] rounded-[8px] border border-[#e2e8f0] bg-white">
            <Search
              aria-hidden="true"
              className="absolute left-[10px] top-1/2 size-[16px] -translate-y-1/2 text-[#005bff]"
            />
            <input
              className="h-full w-full rounded-[8px] bg-transparent pl-[34px] pr-[10px] font-['Inter'] text-[11px] text-[#0f172a] outline-none placeholder:text-[#64748b]"
              placeholder="Search data sources..."
              type="search"
            />
          </div>
          <button
            className="flex h-[36px] items-center gap-[7px] rounded-[8px] border border-[#e2e8f0] bg-white px-[12px] font-['Inter'] text-[11px] font-bold text-[#0f1f6f]"
            type="button"
          >
            <Filter aria-hidden="true" className="size-[15px] text-[#005bff]" />
            All Categories
            <ChevronDown aria-hidden="true" className="size-[14px]" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2 xl:grid-cols-3">
        {dataSources.map((source) => (
          <div
            className="flex min-h-[118px] flex-col justify-between rounded-[10px] border border-[#e2e8f0] bg-white p-[14px]"
            key={source.name}
          >
            <div className="flex gap-[14px]">
              <div
                className={`flex size-[40px] shrink-0 items-center justify-center rounded-[6px] font-['Inter'] text-[16px] font-bold ${source.logoClassName}`}
              >
                {source.logo}
              </div>
              <div className="min-w-0">
                <h4 className="m-0 font-['Inter'] text-[13px] font-bold leading-[18px] text-[#0f1f6f]">
                  {source.name}
                </h4>
                <p className="m-0 mt-[6px] font-['Inter'] text-[11px] font-medium leading-[17px] text-[#0f1f6f]">
                  {source.description}
                </p>
              </div>
            </div>
            <div className="mt-[12px] flex items-center justify-between gap-3">
              <span
                className={`inline-flex items-center gap-[7px] font-['Inter'] text-[11px] font-medium leading-[16px] ${
                  source.connected ? "text-[#059669]" : "text-[#64748b]"
                }`}
              >
                {source.connected ? (
                  <CheckCircle2 aria-hidden="true" className="size-[14px]" />
                ) : (
                  <Clock3 aria-hidden="true" className="size-[14px]" />
                )}
                {source.connected ? "Connected" : "Not Connected"}
              </span>
              <button
                className="h-[32px] rounded-[6px] border border-[#e2e8f0] bg-white px-[13px] font-['Inter'] text-[11px] font-bold leading-[16px] text-[#005bff]"
                type="button"
              >
                {source.connected ? "Manage" : "Connect"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex min-h-[36px] items-center gap-[10px] rounded-[8px] border border-[#bfdbfe] bg-[#eff6ff] px-[14px] font-['Inter'] text-[12px] font-medium leading-[18px] text-[#1e40af]">
        <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full border border-[#005bff] text-[#005bff]">
          i
        </span>
        You can connect multiple sources to improve data coverage and accuracy.
      </div>
    </div>
  );
}

// Seeded once per workspace, only if it has zero triggers yet. Every
// signal_type/signal_category here is a real value from SIGNAL_CATEGORY_MAP
// in backend/app/services/signal_extractor.py, so these are genuinely
// matchable triggers (created via a real POST), not display-only dummy rows -
// one per real signal category, covering the ones most people want on day one.
const STARTER_TRIGGERS: TriggerCreate[] = [
  {
    name: "Buying Intent Signals",
    signal_categories: ["buying_stage"],
    signal_types: ["rfp_published", "vendor_evaluation_mentioned", "contract_awarded"],
  },
  {
    name: "New Funding & Budget",
    signal_categories: ["budget_and_capital"],
    signal_types: ["funding_round_announced", "tech_budget_announced", "acquisition_completed"],
  },
  {
    name: "Leadership Change",
    signal_categories: ["urgency_and_catalysts"],
    signal_types: ["ceo_change", "cto_change", "leadership_mandate_announced"],
  },
  {
    name: "AI Adoption Activity",
    signal_categories: ["ai_seriousness"],
    signal_types: ["ai_tool_adoption", "ai_pilot_announced", "ai_budget_announcement"],
  },
  {
    name: "Operational Pain Points",
    signal_categories: ["ai_pain_points"],
    signal_types: ["operational_inefficiency", "supply_chain_disruption", "cost_pressure_mentioned"],
  },
  {
    name: "Competitive Displacement",
    signal_categories: ["competitive_context"],
    signal_types: ["vendor_replacement_signal", "competitive_evaluation", "greenfield_opportunity"],
  },
  {
    name: "Company Growth Signals",
    signal_categories: ["company_identity"],
    signal_types: ["employee_count_update", "revenue_update", "headquarters_update"],
  },
  {
    name: "Key Contacts Identified",
    signal_categories: ["reachability"],
    signal_types: ["cto_identified", "cfo_identified", "procurement_contact_identified"],
  },
];

function TriggerGenerationForm({ workspaceId }: { workspaceId: string | null }) {
  const [triggers, setTriggers] = useState<TriggerOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceId || seededFor.current === workspaceId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      let rows = await listTriggers(workspaceId);
      if (rows.length === 0) {
        rows = await Promise.all(
          STARTER_TRIGGERS.map((starter) => createTrigger(workspaceId, starter)),
        );
      }
      return rows;
    })()
      .then((rows) => {
        if (cancelled) return;
        seededFor.current = workspaceId;
        setTriggers(rows);
        setEnabled(Object.fromEntries(rows.map((t) => [t.trigger_id, true])));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? String(err.detail) : "Could not load triggers.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <span className="flex h-[34px] w-fit items-center gap-[8px] rounded-[8px] border border-[#005bff] px-[12px] font-['Inter'] text-[11px] font-bold text-[#005bff]">
          All Triggers
          <span className="rounded-full bg-white/80 px-[7px] py-[2px] text-[10px]">
            {triggers.length}
          </span>
        </span>
        <div className="flex gap-[8px]">
          <div className="relative h-[36px] w-[190px] rounded-[8px] border border-[#e2e8f0] bg-white">
            <Search
              aria-hidden="true"
              className="absolute left-[10px] top-1/2 size-[16px] -translate-y-1/2 text-[#005bff]"
            />
            <input
              className="h-full w-full rounded-[8px] bg-transparent pl-[34px] pr-[30px] font-['Inter'] text-[11px] text-[#0f172a] outline-none placeholder:text-[#64748b]"
              placeholder="Search triggers..."
              type="search"
            />
            <span className="absolute right-[10px] top-1/2 -translate-y-1/2 text-[16px] leading-none text-[#94a3b8]">
              ×
            </span>
          </div>
          <button
            className="flex h-[36px] items-center gap-[7px] rounded-[8px] border border-[#e2e8f0] bg-white px-[12px] font-['Inter'] text-[11px] font-bold text-[#0f1f6f]"
            type="button"
          >
            <Filter aria-hidden="true" className="size-[15px] text-[#005bff]" />
            Filters
            <ChevronDown aria-hidden="true" className="size-[14px]" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-[#e2e8f0] bg-white">
        {loading ? (
          <p className="m-0 px-[14px] py-[28px] text-center font-['Inter'] text-[12px] font-medium text-[#64748b]">
            Loading triggers...
          </p>
        ) : loadError ? (
          <p className="m-0 px-[14px] py-[28px] text-center font-['Inter'] text-[12px] font-medium text-[#ef4444]">
            {loadError}
          </p>
        ) : triggers.length === 0 ? (
          <p className="m-0 px-[14px] py-[28px] text-center font-['Inter'] text-[12px] font-medium text-[#64748b]">
            No triggers yet - you can create them later from Trigger Intelligence.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#e2e8f0] text-left">
                {["Trigger", "Signal Match", "Status"].map((heading) => (
                  <th
                    className="px-[12px] py-[11px] font-['Inter'] text-[11px] font-bold leading-[16px] text-[#0f1f6f]"
                    key={heading}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {triggers.map((trigger) => {
                const style =
                  TRIGGER_CATEGORY_STYLES[trigger.signal_categories?.[0] ?? ""] ?? DEFAULT_TRIGGER_STYLE;
                const Icon = style.icon;
                const signalMatch =
                  [...(trigger.signal_types ?? []), ...(trigger.signal_categories ?? [])]
                    .map(humanizeEnumValue)
                    .join(", ") || "—";
                const isEnabled = enabled[trigger.trigger_id] ?? true;

                return (
                  <tr className="border-b border-[#f1f5f9] last:border-b-0" key={trigger.trigger_id}>
                    <td className="px-[12px] py-[9px]">
                      <div className="flex items-center gap-[10px]">
                        <span
                          className={`flex size-[32px] shrink-0 items-center justify-center rounded-[8px] ${style.className}`}
                        >
                          <Icon aria-hidden="true" className="size-[18px]" />
                        </span>
                        <span className="font-['Inter'] text-[11px] font-bold leading-[16px] text-[#0f1f6f]">
                          {trigger.name || "Untitled Trigger"}
                        </span>
                      </div>
                    </td>
                    <td className="max-w-[300px] px-[12px] py-[9px] font-['Inter'] text-[11px] font-medium leading-[17px] text-[#0f1f6f]">
                      {signalMatch}
                    </td>
                    <td className="px-[12px] py-[9px]">
                      <button
                        aria-label={`${trigger.name || "Trigger"} ${isEnabled ? "enabled" : "disabled"}`}
                        className={`relative h-[20px] w-[36px] rounded-full transition-colors ${
                          isEnabled ? "bg-gradient-to-r from-[#7c3aed] to-[#4f46e5]" : "bg-[#e2e8f0]"
                        }`}
                        onClick={() =>
                          setEnabled((prev) => ({
                            ...prev,
                            [trigger.trigger_id]: !isEnabled,
                          }))
                        }
                        type="button"
                      >
                        <span
                          className={`absolute top-[2px] size-[16px] rounded-full bg-white shadow-sm transition-all ${
                            isEnabled ? "right-[2px]" : "left-[2px]"
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && !loadError && triggers.length > 0 && (
        <p className="m-0 font-['Inter'] text-[12px] font-medium leading-[18px] text-[#64748b]">
          Showing {triggers.length} of {triggers.length} triggers
        </p>
      )}
    </div>
  );
}

type IcpFormProps = {
  form: IcpFormState;
  onFieldChange: <K extends keyof IcpFormState>(field: K, value: IcpFormState[K]) => void;
  icpId: string | null;
  workspaceId: string | null;
  // The exact IcpOut just returned by createIcp (see handlePrimaryAction's
  // ICP step block) - appended to the library table immediately below
  // instead of waiting on a second network round-trip to notice it.
  createdIcp: IcpOut | null;
  onUploadStart: () => void;
  onUploadComplete: (batch: ImportBatchOut) => void;
};

type ExcelUploadButtonProps = {
  icpId: string | null;
  workspaceId: string | null;
  onUploadStart: () => void;
  onUploadComplete: (batch: ImportBatchOut) => void;
};

function ExcelUploadButton({ icpId, workspaceId, onUploadStart, onUploadComplete }: ExcelUploadButtonProps) {
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
      // Ingestion/signals/ICP-matching are done by the time this resolves;
      // lead scoring keeps running in the background (batch.scoring_status
      // === "pending") - see AiBusinessDiscoveryForm's polling below.
      const batch = await uploadExcel(workspaceId, icpId, files);
      setUploadedLabel(files.length === 1 ? files[0].name : `${files.length} files`);
      onUploadComplete(batch);
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
          title={ready ? "Upload one or more ZoomInfo exports to score against this ICP" : "Click Continue below to create your ICP first"}
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

function IcpGenerationForm({
  form,
  onFieldChange,
  icpId,
  workspaceId,
  createdIcp,
  onUploadStart,
  onUploadComplete,
}: IcpFormProps) {
  const [icps, setIcps] = useState<IcpOut[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    listIcps(workspaceId).then((rows) => {
      if (!cancelled) setIcps(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, icpId]);

  // Belt-and-suspenders: reflects a newly-created ICP in the table the
  // instant createIcp resolves, rather than depending on the fetch above
  // (keyed on icpId) to have re-run first.
  useEffect(() => {
    if (!createdIcp) return;
    setIcps((prev) => (prev.some((i) => i.icp_id === createdIcp.icp_id) ? prev : [...prev, createdIcp]));
  }, [createdIcp]);

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2 xl:grid-cols-3">
        <SelectField
          icon={icons.workspace}
          label="Primary Industry"
          onChange={(v) => onFieldChange("industry", v)}
          options={industries.map((i) => i.title)}
          required
          value={form.industry}
        />
        <SelectField
          icon={icons.workspace}
          label="Company Size (Employees)"
          onChange={(v) => onFieldChange("company_size", v)}
          options={COMPANY_SIZE_OPTIONS}
          required
          value={form.company_size}
        />
        <SelectField
          icon={icons.currency}
          label="Annual Revenue"
          onChange={(v) => onFieldChange("annual_revenue", v)}
          options={ANNUAL_REVENUE_OPTIONS}
          required
          value={form.annual_revenue}
        />
        <MultiSelectField
          icon={icons.globe}
          label="Headquarters Location"
          onChange={(v) => onFieldChange("headquarters_countries", v)}
          options={ICP_COUNTRY_OPTIONS}
          required
          values={form.headquarters_countries}
        />
        <div className="md:col-span-2">
          <TextField
            icon={icons.workspace}
            label="Technologies Used"
            onChange={(v) => onFieldChange("technologies", v)}
            placeholder="e.g. AWS, Salesforce, HubSpot"
            value={form.technologies}
          />
        </div>
        <MultiSelectField
          icon={icons.workspace}
          label="Target Departments"
          onChange={(v) => onFieldChange("departments", v)}
          options={getDepartmentOptions(form.industry)}
          values={form.departments}
        />
      </div>

      <div className="rounded-[12px] border border-[#e2e8f0] bg-white p-[14px]">
        <div className="mb-[10px] flex items-center justify-between gap-3">
          <div>
            <h3 className="m-0 font-['Inter'] text-[17px] font-bold leading-[23px] text-[#0f1f6f]">
              Your ICP Library
            </h3>
            <p className="m-0 mt-[2px] font-['Inter'] text-[11px] font-medium leading-[17px] text-[#0f1f6f]">
              {icpId
                ? "ICP created - you can now upload your Excel export below."
                : "Fill in the fields above, then click \"Create ICP\" below to enable Excel upload."}
            </p>
          </div>
          <div className="flex items-center gap-[8px]">
            <ExcelUploadButton
              icpId={icpId}
              onUploadComplete={onUploadComplete}
              onUploadStart={onUploadStart}
              workspaceId={workspaceId}
            />
          </div>
        </div>
        {icps.length === 0 ? (
          <p className="m-0 px-[4px] py-[16px] font-['Inter'] text-[11px] font-medium text-[#64748b]">
            No ICPs yet for this workspace.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left">
                {["ICP Name", "Primary Industry", "Company Size", "Annual Revenue", "Created"].map(
                  (heading) => (
                    <th
                      className="px-[4px] py-[8px] font-['Inter'] text-[10px] font-bold text-[#0f1f6f]"
                      key={heading}
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {icps.map((row) => (
                <tr className="border-t border-[#f1f5f9]" key={row.icp_id}>
                  <td className="px-[4px] py-[8px] font-['Inter'] text-[11px] font-bold text-[#0f1f6f]">
                    {row.name || "Untitled ICP"}
                  </td>
                  <td className="px-[4px] py-[8px] font-['Inter'] text-[11px] font-medium text-[#0f1f6f]">
                    {row.industries?.length ? row.industries.join(", ") : "Any"}
                  </td>
                  <td className="px-[4px] py-[8px] font-['Inter'] text-[11px] font-medium text-[#0f1f6f]">
                    {formatRange(row.employee_min, row.employee_max, (v) => String(v))}
                  </td>
                  <td className="px-[4px] py-[8px] font-['Inter'] text-[11px] font-medium text-[#0f1f6f]">
                    {formatRange(row.revenue_min_usd, row.revenue_max_usd, formatMoney)}
                  </td>
                  <td className="px-[4px] py-[8px] font-['Inter'] text-[11px] font-medium text-[#0f1f6f]">
                    {formatDate(row.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function DiscoveryStatus({ status }: { status: string }) {
  if (status === "Completed") {
    return (
      <span className="inline-flex items-center gap-[8px] font-['Inter'] text-[11px] font-bold text-[#16a34a]">
        <CheckCircle2 aria-hidden="true" className="size-[15px]" />
        Completed
      </span>
    );
  }

  if (status === "Analyzing") {
    return (
      <span className="inline-flex items-center gap-[8px] font-['Inter'] text-[11px] font-bold text-[#005bff]">
        <span className="size-[14px] rounded-full border-2 border-[#005bff] border-r-transparent" />
        Analyzing
      </span>
    );
  }

  if (status === "Scoring…") {
    return (
      <span className="inline-flex items-center gap-[8px] font-['Inter'] text-[11px] font-bold text-[#b45309]">
        <span className="size-[14px] rounded-full border-2 border-[#b45309] border-r-transparent" />
        Scoring…
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-[8px] font-['Inter'] text-[11px] font-bold text-[#64748b]">
      <Clock3 aria-hidden="true" className="size-[15px]" />
      Pending
    </span>
  );
}

function AiBusinessDiscoveryForm({ uploadStats }: { uploadStats: "idle" | "uploading" | ImportBatchOut }) {
  const isUploading = uploadStats === "uploading";
  const batch = uploadStats === "idle" || uploadStats === "uploading" ? null : uploadStats;
  // Ingestion/signals/ICP-matching finish synchronously; scoring now runs as
  // a background task afterward (see excel_pipeline.py), so `batch` can be
  // real and non-null while scoring is still going - that's a genuinely
  // different state from "everything, including scoring, is done".
  const scoringDone = batch !== null && batch.scoring_status === "complete";

  const headline = batch
    ? scoringDone
      ? "Data Ingestion Complete"
      : "Scoring In Progress"
    : isUploading
      ? "Processing Your Data"
      : "No Data Uploaded Yet";
  const subtext = batch
    ? `${batch.companies_ingested} companies ingested from ${batch.total_rows} rows${batch.files_processed > 1 ? ` across ${batch.files_processed} files` : ""} - ${batch.matched_icp_count} matched your ICP${scoringDone ? `, ${batch.active_count} scored active` : ""}.${scoringDone ? "" : " Lead scoring is still running in the background and will finish shortly - check the Enterprise List after you go live."}`
    : isUploading
      ? "Ingesting companies, extracting buying signals, and filtering by your ICP - lead scoring then continues in the background."
      : "Go back to the ICP Generation step and upload a ZoomInfo export to see real ingestion results here.";
  const progressPct = batch ? (scoringDone ? 100 : 80) : isUploading ? 50 : 0;

  return (
    <div className="flex h-full flex-col gap-[14px]">
      <div className="rounded-[12px] border border-[#e2e8f0] bg-white p-[20px]">
        <div className="flex flex-col gap-[18px] lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-[16px]">
          <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#faf5ff] text-[#7c3aed]">
            <Target aria-hidden="true" className="size-[22px]" />
          </span>
          <div className="max-w-[420px]">
            <h3 className="m-0 font-['Inter'] text-[22px] font-bold leading-[28px] text-[#0f1f6f]">
              {headline}
            </h3>
            <p className="m-0 mt-[14px] font-['Inter'] text-[13px] font-medium leading-[21px] text-[#0f1f6f]">
              {subtext}
            </p>
          </div>
        </div>

          <div className="w-full max-w-[300px] pt-[6px]">
          <div className="mb-[14px] flex items-center justify-between">
            <span className="font-['Inter'] text-[13px] font-bold text-[#0f1f6f]">
              {batch ? (scoringDone ? "5 of 5 stages" : "4 of 5 stages") : isUploading ? "Processing..." : "Not started"}
            </span>
            <span className="font-['Inter'] text-[13px] font-bold text-[#0f1f6f]">
              {progressPct}% Complete
            </span>
          </div>
          <span className="block h-[8px] overflow-hidden rounded-full bg-[#e2e8f0]">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-[#005bff] via-[#7c3aed] to-[#db2777] transition-[width] duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </span>
        </div>
        </div>
      </div>

      <div className="rounded-[12px] border border-[#e2e8f0] bg-white p-[20px]">
        <h3 className="m-0 font-['Inter'] text-[22px] font-bold leading-[28px] text-[#0f1f6f]">
          Pipeline Stages
        </h3>

        <div className="mt-[16px] flex flex-col gap-[10px]">
          {DISCOVERY_STAGE_DEFS.map((stage) => {
            const Icon = stage.icon;
            const stagePending = stage.isScoringStage && batch !== null && !scoringDone;
            const status = stagePending
              ? "Scoring…"
              : batch
                ? "Completed"
                : isUploading
                  ? "Analyzing"
                  : "Pending";
            const detail = stagePending
              ? "Running in the background"
              : batch
                ? stage.detail(batch)
                : isUploading
                  ? "Processing..."
                  : "Waiting for Excel upload";

            return (
              <div
                className="grid grid-cols-1 gap-[10px] rounded-[8px] px-[8px] py-[4px] sm:grid-cols-[minmax(0,1fr)_110px_180px] sm:items-center sm:gap-[18px]"
                key={stage.name}
              >
                <div className="flex min-w-0 items-center gap-[14px]">
                  <span
                    className={`flex size-[34px] shrink-0 items-center justify-center rounded-[8px] ${stage.iconClassName}`}
                  >
                    <Icon aria-hidden="true" className="size-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <p className="m-0 font-['Inter'] text-[13px] font-bold leading-[18px] text-[#0f1f6f]">
                      {stage.name}
                    </p>
                    <p className="m-0 mt-[2px] font-['Inter'] text-[11px] font-medium leading-[16px] text-[#0f1f6f]">
                      {stage.description}
                    </p>
                  </div>
                </div>

                <DiscoveryStatus status={status} />
                <p className="m-0 font-['Inter'] text-[11px] font-bold leading-[16px] text-[#0f1f6f]">
                  {detail}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GoLiveForm() {
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="grid grid-cols-1 gap-[14px] xl:grid-cols-[1fr_0.62fr]">
        <div className="overflow-hidden rounded-[12px] border border-[#e2e8f0] bg-white">
          <div className="flex flex-col gap-[16px] border-b border-[#e2e8f0] p-[18px] md:flex-row md:items-center">
            <img
              alt="Rocket launching"
              className="h-[134px] w-[134px] shrink-0 rounded-[10px] object-cover"
              draggable={false}
              src={goLiveRocketImage}
            />
            <div className="flex min-w-0 items-start gap-[12px]">
              <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-[#dcfce7] text-[#16a34a]">
                <CheckCircle2 aria-hidden="true" className="size-[24px]" />
              </span>
              <div>
                <h3 className="m-0 font-['Inter'] text-[26px] font-bold leading-[32px] text-[#0f1f6f]">
                  Onboarding Completed and Go Live!
                </h3>
                <p className="m-0 mt-[14px] font-['Inter'] text-[13px] font-medium leading-[21px] text-[#0f1f6f]">
                  Your account has been successfully configured. XSparks AI is
                  now ready to help you identify high-intent prospects, engage
                  smarter, and drive revenue growth.
                </p>
              </div>
            </div>
          </div>

          <div className="p-[16px]">
            <h3 className="m-0 font-['Inter'] text-[17px] font-bold leading-[24px] text-[#0f1f6f]">
              What's Ready for You
            </h3>
            <div className="mt-[12px] grid grid-cols-1 gap-[10px] md:grid-cols-2 xl:grid-cols-3">
              {goLiveFeatures.map((feature) => {
                const Icon = feature.icon;

                return (
                  <div
                    className="flex min-h-[102px] gap-[12px] rounded-[10px] border border-[#e2e8f0] bg-white p-[12px]"
                    key={feature.title}
                  >
                    <span
                      className={`flex size-[40px] shrink-0 items-center justify-center rounded-[8px] ${feature.className}`}
                    >
                      <Icon aria-hidden="true" className="size-[22px]" />
                    </span>
                    <div>
                      <p className="m-0 font-['Inter'] text-[12px] font-bold leading-[18px] text-[#0f1f6f]">
                        {feature.title}
                      </p>
                      <p className="m-0 mt-[5px] font-['Inter'] text-[11px] font-medium leading-[17px] text-[#0f1f6f]">
                        {feature.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-[14px]">
          <div className="rounded-[12px] border border-[#e2e8f0] bg-white p-[18px]">
            <div className="mb-[14px] flex items-center gap-[10px]">
              <CheckCircle2 aria-hidden="true" className="size-[22px] text-[#16a34a]" />
              <h3 className="m-0 font-['Inter'] text-[18px] font-bold leading-[24px] text-[#0f1f6f]">
                Setup Summary
              </h3>
            </div>
            <div className="flex flex-col gap-[9px]">
              {setupSummaryItems.map((item) => (
                <div className="flex items-center justify-between gap-[14px]" key={item}>
                  <span className="flex min-w-0 items-center gap-[8px]">
                    <CheckCircle2
                      aria-hidden="true"
                      className="size-[16px] shrink-0 text-[#16a34a]"
                    />
                    <span className="truncate font-['Inter'] text-[12px] font-bold text-[#0f1f6f]">
                      {item}
                    </span>
                  </span>
                  <span className="font-['Inter'] text-[11px] font-bold text-[#16a34a]">
                    Complete
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[12px] border border-[#e9d5ff] bg-[#faf5ff] p-[18px]">
            <div className="flex items-center gap-[10px]">
              <Target aria-hidden="true" className="size-[22px] text-[#7c3aed]" />
              <h3 className="m-0 font-['Inter'] text-[16px] font-bold text-[#7c3aed]">
                Pro Tip
              </h3>
            </div>
            <p className="m-0 mt-[14px] font-['Inter'] text-[12px] font-medium leading-[20px] text-[#0f1f6f]">
              The more you engage with XSparks AI, the smarter and more accurate
              the insights become. Keep exploring!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OnboardingStepper({ activeStep }: { activeStep: number }) {
  const connectorOffset = 100 / (steps.length * 2);
  const connectorSegment = 100 / steps.length;

  return (
    <div
      className="relative grid gap-2"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      <div
        className="absolute top-[16px] z-0 h-px bg-[#e2e8f0]"
        style={{ left: `${connectorOffset}%`, right: `${connectorOffset}%` }}
      />
      <div
        className="absolute top-[16px] z-0 h-px bg-[#22c55e] transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          left: `${connectorOffset}%`,
          width: `${Math.min(activeStep, steps.length - 1) * connectorSegment}%`,
        }}
      />
      {steps.map((step, index) => {
        const isActive = index === activeStep;
        const isComplete = index < activeStep;
        const stepLabel = step.join(" ");

        return (
          <div
            className={`relative z-10 flex min-w-0 flex-col items-center gap-[6.875px] ${
              isActive || isComplete ? "" : "opacity-40"
            }`}
            key={stepLabel}
          >
            <div
              className={`flex size-[32px] items-center justify-center rounded-full font-['IBM_Plex_Sans'] text-[12px] font-medium leading-[16px] ${
                isActive
                  ? "bg-[#4f46e5] text-white shadow-[0px_4px_10px_rgba(79,70,229,0.28)]"
                  : isComplete
                    ? "bg-[#22c55e] text-white shadow-[0px_4px_10px_rgba(34,197,94,0.22)]"
                  : "bg-[#f1f5f9] text-[#94a3b8]"
              }`}
            >
              {isComplete ? (
                <Check aria-hidden="true" className="size-[16px]" strokeWidth={3} />
              ) : (
                index + 1
              )}
            </div>
            <p
              className={`m-0 text-center font-['IBM_Plex_Sans'] text-[11px] font-normal leading-[13.75px] ${
                isActive
                  ? "text-[#4f46e5]"
                  : isComplete
                    ? "text-[#16a34a]"
                    : "text-[#64748b]"
              }`}
            >
              {step.map((line) => (
                <span className="block" key={`${stepLabel}-${line}`}>
                  {line}
                </span>
              ))}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function OnboardingCard() {
  const navigate = useNavigate();
  const { user: firebaseUser } = useAuth();
  // Landing here can mean "genuinely new account" OR "RequireOnboarding
  // bounced a returning user here because this browser's cached session was
  // empty" (different browser, cleared storage, etc.) - GET /auth/me (via
  // resolvePostLoginPath) tells the two apart by the real Firebase identity
  // instead of this browser's local cache, so a returning user gets sent
  // straight to /dashboard instead of redoing the wizard.
  const [checkingAccount, setCheckingAccount] = useState(true);
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState<OnboardingFormState>(initialFormState);
  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [icpForm, setIcpForm] = useState<IcpFormState>(initialIcpFormState);
  const [icpId, setIcpId] = useState<string | null>(null);
  const [createdIcp, setCreatedIcp] = useState<IcpOut | null>(null);
  // Business Discovery (step 8) shows the REAL result of the Excel upload
  // pipeline triggered from the ICP step, not fake "AI is analyzing"
  // content - "idle" (nothing uploaded yet), "uploading" (ingestion/signals/
  // ICP-matching running server-side), or the real batch once that
  // finishes (still scoring_status: "pending" until the background scoring
  // task catches up - see the polling effect below).
  const [uploadStats, setUploadStats] = useState<"idle" | "uploading" | ImportBatchOut>("idle");

  // Scoring runs in the background after the upload responds - poll until
  // this specific batch flips to "complete" so step 8 updates itself
  // instead of staying stuck showing "Scoring In Progress" forever.
  useEffect(() => {
    if (uploadStats === "idle" || uploadStats === "uploading" || uploadStats.scoring_status === "complete" || !workspaceId) {
      return;
    }
    const batchId = uploadStats.import_batch_id;
    const interval = setInterval(() => {
      listImportBatches(workspaceId)
        .then((batches) => {
          const updated = batches.find((b) => b.import_batch_id === batchId);
          if (updated && updated.scoring_status === "complete") {
            setUploadStats(updated);
          }
        })
        .catch(() => {
          // Transient fetch failure - just try again on the next tick.
        });
    }, 5000);
    return () => clearInterval(interval);
  }, [uploadStats, workspaceId]);

  useEffect(() => {
    if (!firebaseUser) {
      setCheckingAccount(false);
      return;
    }
    let cancelled = false;
    resolvePostLoginPath().then((path) => {
      if (cancelled) return;
      if (path === "/dashboard") {
        navigate("/dashboard", { replace: true });
      } else {
        setCheckingAccount(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, navigate]);

  const isOrganizationStep = activeStep === 0;
  const isWorkspaceStep = activeStep === 1;
  const isTeamStep = activeStep === 2;
  const isDataSourceStep = activeStep === 3;
  const isTriggerStep = activeStep === 4;
  const isIcpStep = activeStep === 5;
  const isAiBusinessStep = activeStep === 6;
  const isGoLiveStep = activeStep === 7;
  const stepperStep = activeStep;
  // Flexes to fill whatever space is left after the fixed-size stepper/
  // title/footer chrome, instead of a fixed pixel height - that fixed
  // height was the reason the whole page grew taller than the viewport
  // and forced the browser (not just this panel) to scroll on laptops.
  const formViewportClassName = "mt-[18px] min-h-0 flex-1 overflow-hidden";
  const trackRef = useRef<HTMLDivElement>(null);

  // Each step panel keeps its own scrollTop even while off-screen (they're
  // all rendered side by side and slid via translateX, not remounted per
  // step). Without this, switching to a step whose panel was left scrolled
  // - or hit by Chrome's scroll-anchoring on a panel taller than the fixed
  // viewport height - shows content clipped at the top instead of at rest.
  useEffect(() => {
    const panel = trackRef.current?.children[activeStep];
    if (panel) {
      panel.scrollTop = 0;
    }
  }, [activeStep]);

  const handleFieldChange = <K extends keyof OnboardingFormState>(field: K, value: OnboardingFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleIcpFieldChange = <K extends keyof IcpFormState>(field: K, value: IcpFormState[K]) => {
    setIcpForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePrimaryAction = async () => {
    if (isGoLiveStep) {
      navigate("/dashboard");
      return;
    }

    // Organisation must exist before a Workspace can reference it
    // (Workspace.organisation_id is required) - Organization Setup runs
    // first and creates the Organisation alone; Workspace Setup runs
    // second and creates the Workspace once organisationId is available.
    // No PATCH endpoint exists on either, so each step submits everything
    // it collected in one POST when the user leaves that step.
    if (isOrganizationStep && organisationId === null) {
      if (!form.company_name.trim()) {
        setSubmitError("Company Name is required.");
        return;
      }
      setSubmitting(true);
      setSubmitError(null);
      try {
        const org = await createOrganisation({
          account_name: form.company_name || null,
          account_url: form.account_url || null,
          account_logo_url: form.account_logo_url || null,
          company_name: form.company_name,
          website: form.website || null,
          legal_business_name: form.legal_business_name || null,
          industry: form.industry || null,
          sub_industry: form.sub_industry || null,
          business_type: form.business_type || null,
          headquarters_location: form.headquarters_location || null,
          founded_year: form.founded_year || null,
          company_description: form.company_description || null,
        });
        setOrganisationId(org.organisation_id);
        setSessionOrganisationId(org.organisation_id);
      } catch (err) {
        setSubmitError(
          err instanceof ApiError ? String(err.detail) : "Something went wrong. Please try again.",
        );
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
    }

    if (isWorkspaceStep && workspaceId === null) {
      if (!organisationId) {
        setSubmitError("Organisation setup must complete before creating a workspace.");
        return;
      }
      // Workspace Name is optional in the UI (Workspace.workspace_name is
      // still a NOT NULL column on the backend, so a blank entry falls back
      // to a generated placeholder instead of blocking the step). Your
      // Email is no longer free-typed - it's locked to whichever Firebase
      // account is actually logged in (RequireAuth guarantees one exists on
      // every onboarding page), and the backend re-derives/verifies it from
      // the request's bearer token anyway (see app/controllers/users.py),
      // so this is really just what gets shown while submitting.
      const workspaceName = form.workspace_name.trim() || `${form.company_name || "My"} Workspace`;
      const userEmail = firebaseUser?.email ?? `founder+${Date.now()}@placeholder.local`;

      setSubmitting(true);
      setSubmitError(null);
      try {
        const workspace = await createWorkspace(organisationId, {
          workspace_name: workspaceName,
          purpose: form.workspace_purpose || null,
        });
        setSessionWorkspaceId(workspace.workspace_id);
        setWorkspaceId(workspace.workspace_id);

        // A Workspace doesn't belong to one user (WorkspaceMember is a
        // many-to-many join) - this creates the founder's User record and
        // adds them as a member of the workspace they just set up, since
        // onboarding never created a User at all before this.
        const user = await createUser(organisationId, {
          email: userEmail,
          full_name: form.user_full_name || null,
          designation: form.designation || null,
        });
        await addWorkspaceMember(workspace.workspace_id, {
          user_id: user.user_id,
          role: "owner",
        });
      } catch (err) {
        setSubmitError(
          err instanceof ApiError ? String(err.detail) : "Something went wrong. Please try again.",
        );
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
    }

    if (isIcpStep && icpId === null) {
      if (workspaceId) {
        setSubmitting(true);
        setSubmitError(null);
        const employees = parseEmployeeRange(icpForm.company_size);
        const revenue = parseRevenueRange(icpForm.annual_revenue);
        try {
          const icp = await createIcp(workspaceId, {
            name: icpForm.industry ? `${icpForm.industry} ICP` : "Onboarding ICP",
            industries: icpForm.industry ? [icpForm.industry] : null,
            employee_min: employees.min,
            employee_max: employees.max,
            revenue_min_usd: revenue.min,
            revenue_max_usd: revenue.max,
            countries: icpForm.headquarters_countries.length ? icpForm.headquarters_countries : null,
            technologies: icpForm.technologies
              ? icpForm.technologies.split(",").map((t) => t.trim()).filter(Boolean)
              : null,
            departments: icpForm.departments.length ? icpForm.departments : null,
          });
          setIcpId(icp.icp_id);
          setCreatedIcp(icp);
        } catch (err) {
          setSubmitError(
            err instanceof ApiError ? String(err.detail) : "Something went wrong. Please try again.",
          );
          setSubmitting(false);
          return;
        }
        setSubmitting(false);
        // Stay on this step - the Upload Excel button only enables once
        // icpId is set, so advancing immediately would mean it never
        // renders in a clickable state. A second click on Continue (now
        // that icpId !== null) falls through to the normal advance below.
        return;
      }
    }

    setActiveStep((step) => Math.min(step + 1, 7));
  };

  const handleSecondaryAction = () => {
    if (activeStep > 0) {
      setActiveStep((step) => step - 1);
    }
  };

  if (checkingAccount) {
    return (
      <section className="relative z-20 flex h-full w-full items-center justify-center bg-white font-['Inter'] text-[14px] text-[#64748b]">
        Loading...
      </section>
    );
  }

  return (
    <section className="relative z-20 flex h-full w-full flex-col bg-white px-[36px] pb-[18px] pt-[34px]">
      <OnboardingStepper activeStep={stepperStep} />

      <div className="mt-[39px]">
        <h2 className="m-0 font-['Inter'] text-[18px] font-bold leading-[27px] text-[#1e293b]">
          {isGoLiveStep
            ? "Go Live"
            : isAiBusinessStep
            ? "Analysis in Progress"
            : isIcpStep
              ? "Define Your Ideal Customer Profile (Manual Input)"
              : isTriggerStep
                ? "Your Triggers"
                : isDataSourceStep
                  ? "Connect Your Data Sources"
                  : isTeamStep
                    ? "Invite Team Members"
                    : isOrganizationStep
                      ? "Organization Information"
                      : "Workspace Information"}
        </h2>
        <p className="m-0 mt-[2px] font-['Inter'] text-[14px] font-normal leading-[21px] text-[#64748b]">
          {isGoLiveStep
            ? "Congratulations! Your XSparks AI platform is ready to drive outcomes."
            : isAiBusinessStep
            ? "We're analyzing your business to build a powerful foundation for personalized insights."
            : isIcpStep
              ? "Provide the key details about your ideal customer. This will help AI generate accurate insights."
              : isTriggerStep
                ? "Triggers matched against your signal data to flag high-intent moments."
                : isDataSourceStep
                  ? "Connect external data sources to enrich profiles, detect buying signals, and power AI insights."
                  : isTeamStep
                    ? "Add your teammates by email and assign appropriate roles."
                    : isOrganizationStep
                      ? "Tell us about your organization so we can personalize your XSparks experience."
                      : "This will be your organization's dedicated workspace in XSparks."}
        </p>
      </div>

      <div className={formViewportClassName}>
        <div
          className="flex h-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          ref={trackRef}
          style={{ transform: `translateX(-${activeStep * 100}%)` }}
        >
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]" style={{ overflowAnchor: "none" }}>
            <OrganizationSetupForm form={form} onFieldChange={handleFieldChange} />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]" style={{ overflowAnchor: "none" }}>
            <WorkspaceSetupForm firebaseEmail={firebaseUser?.email ?? null} form={form} onFieldChange={handleFieldChange} />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]" style={{ overflowAnchor: "none" }}>
            <TeamInvitationsForm />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]" style={{ overflowAnchor: "none" }}>
            <DataSourceSetupForm />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]" style={{ overflowAnchor: "none" }}>
            <TriggerGenerationForm workspaceId={workspaceId} />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]" style={{ overflowAnchor: "none" }}>
            <IcpGenerationForm
              createdIcp={createdIcp}
              form={icpForm}
              icpId={icpId}
              onFieldChange={handleIcpFieldChange}
              onUploadComplete={setUploadStats}
              onUploadStart={() => setUploadStats("uploading")}
              workspaceId={workspaceId}
            />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]" style={{ overflowAnchor: "none" }}>
            <AiBusinessDiscoveryForm uploadStats={uploadStats} />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]" style={{ overflowAnchor: "none" }}>
            <GoLiveForm />
          </div>
        </div>
      </div>

      <footer className="mt-auto flex min-h-[79px] flex-col gap-3 border-t border-[#f1f5f9] pt-[24px]">
        {submitError && (
          <div className="flex min-h-[36px] items-center rounded-[8px] border border-[#fecaca] bg-[#fef2f2] px-[12px] font-['Inter'] text-[12px] font-medium leading-[18px] text-[#b91c1c]">
            {submitError}
          </div>
        )}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-[12px]">
            <div className="flex size-[32px] shrink-0 items-center justify-center rounded-[8px] bg-[#eff6ff]">
              <img alt="" className="size-[20px]" src={icons.secure} />
            </div>
            <div className="min-w-0">
              <p className="m-0 font-['Inter'] text-[11px] font-bold leading-[16.5px] text-[#334155]">
                Your data is safe and secure
              </p>
              <p className="m-0 font-['Inter'] text-[11px] font-normal leading-[16.5px] text-[#94a3b8]">
                We'll never share your information
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-[32px]">
            <button
              className="font-['Inter'] text-[14px] font-medium leading-[20px] text-[#64748b]"
              onClick={handleSecondaryAction}
              type="button"
            >
              {activeStep > 0 ? "Back" : "Skip for now"}
            </button>
            <button
              className="flex h-[44px] items-center gap-[8px] rounded-[12px] bg-gradient-to-r from-[#f75317] via-[#7c3aed] via-[58.173%] to-[#0c20ff] to-[97.115%] px-[40px] py-[12px] shadow-[0px_10px_15px_-3px_#c7d2fe,0px_4px_6px_-4px_#c7d2fe] disabled:opacity-60"
              disabled={submitting}
              onClick={handlePrimaryAction}
              type="button"
            >
              <span className="font-['Inter'] text-[14px] font-bold leading-[20px] text-white">
                {submitting
                  ? "Saving..."
                  : isGoLiveStep
                    ? "Start Using XSparks"
                    : isAiBusinessStep
                      ? "Continue"
                      : isIcpStep && icpId === null
                        ? "Create ICP"
                        : isIcpStep
                          ? "Continue"
                          : activeStep > 0
                            ? "Save & Continue"
                              : "Continue"}
              </span>
              <img alt="" className="size-[16px]" src={icons.arrowRight} />
            </button>
          </div>
        </div>
      </footer>
    </section>
  );
}

export function OnboardingPage() {
  return (
    <main
      className="h-screen overflow-hidden px-[clamp(1.5rem,4vw,3rem)] py-[clamp(1.125rem,2.4vh,2rem)]"
      style={{ backgroundImage: pageBackground }}
    >
      {/* <main> is a hard, definite h-screen at every width, so h-full down
          the tree (wrapper -> card section) is an unambiguous fill instead
          of a floor - a min-height alone can't stop a tall child from
          growing past it and dragging the whole page into scrolling, which
          is what happened with the first pass at this fix.

          This row is flex, not grid: CSS Grid's implicit row track sizes to
          its content's auto/intrinsic height by default (align-items:
          stretch only stretches an item within that content-sized track,
          it does NOT make the track fill the grid container the way flex's
          stretch fills a definite-height flex container) - so h-full on a
          grid child was being silently ignored, the card grew to its
          natural unbounded height, and paired with overflow-hidden here
          (for the rounded corners) that excess was clipped with no way to
          scroll to it instead of properly shrinking. Flexbox's stretch has
          no such trap: a flex item with no explicit size reliably fills a
          definite-height flex container.

          The hero branding panel is hidden below lg: its min-h-[360px]
          floor was competing with the form for a share of a much shorter
          viewport once the two are stacked instead of side by side; the
          form is the part that actually needs the room. */}
      <div className="relative mx-auto flex h-full w-full max-w-[1440px] flex-col lg:flex-row lg:gap-[24px]">
        <section className="relative z-10 hidden flex-col overflow-hidden px-[28px] py-[30px] lg:flex lg:h-full lg:min-h-0 lg:w-[clamp(300px,26vw,350px)] lg:shrink-0 lg:px-[38px] lg:py-[42px]">
          {/* The image + white fade are clipped hard at the section's own
              box (overflow-hidden + inset-0), which is what reads as a
              "boundary" once the section lost its own background fill - a
              rectangular cutout still looks like a separate card even with
              no bg-color, border, or shadow. A mask-image attempt to fade
              this didn't render (still showed a hard edge), so instead an
              actual vignette is painted on top, transparent in the middle
              and fading to an opaque colour matching the page's own
              gradient at the edges - a plain radial-gradient background,
              not relying on mask support. */}
          <img
            alt=""
            className="pointer-events-none absolute inset-0 z-0 h-full w-full select-none object-cover object-bottom opacity-95"
            draggable={false}
            src={heroImage}
          />
          {/* Was pure white (from-white/90 etc.) - a different hue from the
              page's pale lavender background, so the text-readability fade
              at the top of the panel never matched the page even with the
              vignette below correctly fading everything else. Recoloured
              to the page's own rgb(228,227,251) so brightness/opacity
              still varies for contrast, but the hue stays consistent with
              what's actually behind this panel. */}
          <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-[rgb(228,227,251)]/90 via-[rgb(228,227,251)]/55 via-[34%] to-[rgb(228,227,251)]/10" />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[52%] bg-[rgb(228,227,251)]/25 backdrop-blur-[1px]" />
          <div
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{
              background:
                "radial-gradient(ellipse 65% 62% at 50% 40%, transparent 40%, rgba(224,224,250,0.85) 78%, rgb(228,227,251) 100%)",
            }}
          />
          <FigmaLogo className="relative z-10 origin-left scale-110 lg:scale-[1.12]" />

          <div className="relative z-10 mt-[42px] max-w-[360px] lg:mt-[58px]">
            <h1 className="m-0 font-['Inter'] text-[clamp(2rem,3.4vw,34px)] font-bold leading-[1.2] text-[#1e293b]">
              <span className="block">Let's personalize</span>
              <span className="block bg-gradient-to-r from-[#ff6b35] to-[#0d00e9] bg-clip-text text-transparent">
                your experience
              </span>
            </h1>
            <p className="m-0 mt-[22px] max-w-[300px] font-['Inter'] text-[16px] font-normal leading-[26px] text-[#64748b]">
              Help us understand your goals so we can tailor Xsparks.ai to
              deliver the most relevant insights and opportunities.
            </p>
          </div>

          <div className="relative z-10 flex-1" />

          <div className="relative z-10 mt-[22px] flex items-center gap-[12px] rounded-[12px] bg-white/78 p-[12px] shadow-[0px_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-sm">
            <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[8px] bg-[#eef2ff]">
              <img alt="" className="size-[20px]" src={icons.secure} />
            </div>
            <div className="min-w-0">
              <p className="m-0 font-['Inter'] text-[12px] font-bold leading-[17px] text-[#334155]">
                Enterprise-grade security
              </p>
              <p className="m-0 font-['Inter'] text-[11px] font-normal leading-[16px] text-[#64748b]">
                Your data is safe with us
              </p>
            </div>
          </div>
        </section>

        <div className="relative z-20 h-full min-w-0 overflow-hidden rounded-[24px] shadow-[0px_18px_45px_rgba(15,23,42,0.10)] lg:flex-1">
          <OnboardingCard />
        </div>
      </div>
    </main>
  );
}
