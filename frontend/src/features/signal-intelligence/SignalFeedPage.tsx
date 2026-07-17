import {
  Atom,
  Bookmark,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Layers,
  MoreVertical,
  RefreshCw,
  Snowflake,
  Triangle,
  Users,
} from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { cn } from "../../lib/cn";
import { listSignals, type SignalWithCompanyOut } from "../../api/signals";
import { getOrganisationId } from "../../lib/session";
import { categoryLabel, SIGNAL_CATEGORY_OPTIONS } from "../../lib/signalCategories";

function relativeTime(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

/* ------------------------------------------------------------------ */
/* Company logos                                                       */
/* ------------------------------------------------------------------ */

type Logo =
  | { type: "icon"; icon: ComponentType<{ className?: string }>; bg: string; color: string }
  | { type: "text"; text: string; bg: string; color: string }
  | { type: "microsoft" };

function CompanyLogo({ logo }: { logo: Logo }) {
  if (logo.type === "microsoft") {
    return (
      <span className="grid size-[52px] shrink-0 grid-cols-2 grid-rows-2 gap-[3px] rounded-[12px] border border-[#eef1f6] bg-white p-[11px]">
        <span className="rounded-[1px] bg-[#f25022]" />
        <span className="rounded-[1px] bg-[#7fba00]" />
        <span className="rounded-[1px] bg-[#00a4ef]" />
        <span className="rounded-[1px] bg-[#ffb900]" />
      </span>
    );
  }

  return (
    <span
      className="flex size-[52px] shrink-0 items-center justify-center rounded-[12px] text-[15px] font-bold"
      style={{ backgroundColor: logo.bg, color: logo.color }}
    >
      {logo.type === "icon" ? <logo.icon className="size-[26px]" /> : logo.text}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Tags & badges                                                       */
/* ------------------------------------------------------------------ */

const tagTones: Record<string, string> = {
  purple: "bg-[#f3e9ff] text-[#7c3aed]",
  gray: "bg-[#f1f5f9] text-[#64748b]",
  orange: "bg-[#fff1e3] text-[#f97316]",
  green: "bg-[#e7f8ef] text-[#16a34a]",
  blue: "bg-[#e6f0ff] text-[#2563eb]",
};

function Tag({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-[6px] px-[10px] py-[4px] text-[12px] font-semibold",
        tagTones[tone],
      )}
    >
      {label}
    </span>
  );
}

const intentTones: Record<string, string> = {
  High: "bg-[#f3e9ff] text-[#7c3aed]",
  Medium: "bg-[#fff1e3] text-[#f97316]",
};

function IntentBadge({ level }: { level: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[8px] px-[12px] py-[5px] text-[13px] font-semibold",
        intentTones[level],
      )}
    >
      {level}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

const filters = ["All Intent Levels", "All Industries", "All Signal Types", "All Geographies"];

/* signal_category is the only filter dimension backed by a real column
 * (Signal.signal_category) - it's a functional <select>, wired to the
 * /signals list endpoint's ?category= param. The rest stay decorative
 * placeholders since no matching backend field exists yet. */
function CategoryFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-medium text-[#334155]">
      <select
        className="cursor-pointer appearance-none bg-transparent pr-[18px] outline-none"
        onChange={(e) => onChange(e.target.value)}
        value={value}
      >
        <option value="">All Categories</option>
        {SIGNAL_CATEGORY_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {categoryLabel(option)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-[14px] size-[15px] text-[#94a3b8]" />
    </div>
  );
}

function FilterBar({ category, onCategoryChange }: { category: string; onCategoryChange: (value: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-[12px]">
      {filters.map((label) => (
        <button
          className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-medium text-[#334155]"
          key={label}
          type="button"
        >
          {label}
          <ChevronDown className="size-[15px] text-[#94a3b8]" />
        </button>
      ))}
      <CategoryFilter onChange={onCategoryChange} value={category} />
      <button
        className="ml-auto flex items-center gap-[10px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-medium text-[#334155]"
        type="button"
      >
        May 13 – May 20, 2025
        <Calendar className="size-[16px] text-[#4f46e5]" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Signal data                                                         */
/* ------------------------------------------------------------------ */

type Signal = {
  signalId?: string;
  logo: Logo;
  title: string;
  description: string;
  tags: { label: string; tone: string }[];
  company: string;
  domain: string;
  size: string;
  intent: string;
  score: number;
  detected: string;
};

/* SignalWithCompanyOut has no logo/domain/company-size/title - those are
 * UI-only concepts (see onboarding audit: Signal is a firmographic-free
 * extraction record). Real id/company/category/confidence-derived score
 * come from the API; the rest falls back to generic/derived values. */
function toSignal(s: SignalWithCompanyOut): Signal {
  const confidence = s.signal_confidence ?? 0;
  const intent = confidence >= 0.8 ? "High" : confidence >= 0.5 ? "Medium" : "Low";
  return {
    signalId: s.signal_id,
    logo: { type: "icon", icon: Layers, bg: "#eef1ff", color: "#5b3df5" },
    title: s.signal_type.replace(/_/g, " "),
    description: s.core_fact ?? "—",
    tags: [
      { label: categoryLabel(s.signal_category), tone: "purple" },
      { label: s.signal_type.replace(/_/g, " "), tone: "gray" },
    ],
    company: s.company_name,
    domain: "—",
    size: "—",
    intent,
    score: Math.round(confidence * 100),
    detected: relativeTime(s.ingested_at),
  };
}

const dummySignals: Signal[] = [
  {
    logo: { type: "icon", icon: Triangle, bg: "#0f172a", color: "#ffffff" },
    title: "Series B funding round announced",
    description: "Acme Corp raised $25M in Series B funding led by Sequoia Capital.",
    tags: [
      { label: "Funding & Investment", tone: "purple" },
      { label: "Press Release", tone: "gray" },
    ],
    company: "Acme Corp",
    domain: "acmecorp.com",
    size: "501-1K",
    intent: "High",
    score: 96,
    detected: "8m ago",
  },
  {
    logo: { type: "microsoft" },
    title: "Major hiring increase in AI division",
    description: "Microsoft is hiring 120+ new roles in their AI & Research division.",
    tags: [
      { label: "Hiring", tone: "purple" },
      { label: "Company News", tone: "gray" },
    ],
    company: "Microsoft",
    domain: "microsoft.com",
    size: "10K+",
    intent: "High",
    score: 95,
    detected: "15m ago",
  },
  {
    logo: { type: "icon", icon: Snowflake, bg: "#eaf6fd", color: "#29b5e8" },
    title: "New data center expansion",
    description: "Snowflake announced expansion of their data center in Mumbai, India.",
    tags: [
      { label: "Expansion", tone: "orange" },
      { label: "Press Release", tone: "gray" },
    ],
    company: "Snowflake",
    domain: "snowflake.com",
    size: "2K-5K",
    intent: "Medium",
    score: 89,
    detected: "22m ago",
  },
  {
    logo: { type: "icon", icon: Atom, bg: "#0f172a", color: "#ffffff" },
    title: "New enterprise product launch",
    description: "OpenAI launched a new enterprise solution for large organizations.",
    tags: [
      { label: "Product Launch", tone: "purple" },
      { label: "Company News", tone: "gray" },
    ],
    company: "OpenAI",
    domain: "openai.com",
    size: "1K-2K",
    intent: "High",
    score: 92,
    detected: "35m ago",
  },
  {
    logo: { type: "icon", icon: Layers, bg: "#fdecec", color: "#ef4444" },
    title: "$1B+ funding round rumored",
    description:
      "Databricks is in advanced talks for a $1B+ funding round at a $43B valuation.",
    tags: [
      { label: "Funding & Investment", tone: "purple" },
      { label: "Market Rumor", tone: "gray" },
    ],
    company: "Databricks",
    domain: "databricks.com",
    size: "2K-5K",
    intent: "High",
    score: 94,
    detected: "48m ago",
  },
  {
    logo: { type: "icon", icon: Cloud, bg: "#eaf4ff", color: "#00a1e0" },
    title: "Partnership with AWS announced",
    description: "Salesforce and AWS announce strategic partnership for cloud innovation.",
    tags: [
      { label: "Partnership", tone: "green" },
      { label: "Press Release", tone: "gray" },
    ],
    company: "Salesforce",
    domain: "salesforce.com",
    size: "10K+",
    intent: "Medium",
    score: 86,
    detected: "1h ago",
  },
  {
    logo: { type: "text", text: "Ui", bg: "#fb6d3a", color: "#ffffff" },
    title: "CEO visited major enterprise",
    description: "UiPath CEO was spotted at a Fortune 500 company headquarters.",
    tags: [
      { label: "Executive Movement", tone: "blue" },
      { label: "Intent Signal", tone: "gray" },
    ],
    company: "UiPath",
    domain: "uipath.com",
    size: "1K-2K",
    intent: "Medium",
    score: 82,
    detected: "1h 15m ago",
  },
  {
    logo: { type: "icon", icon: Layers, bg: "#fdece6", color: "#fa582d" },
    title: "New cybersecurity solution launch",
    description: "Palo Alto Networks launched a new AI-driven cybersecurity solution.",
    tags: [
      { label: "Product Launch", tone: "purple" },
      { label: "Company News", tone: "gray" },
    ],
    company: "Palo Alto Networks",
    domain: "paloaltonetworks.com",
    size: "5K-10K",
    intent: "High",
    score: 91,
    detected: "1h 32m ago",
  },
];

const tableColumns =
  "grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_92px_120px_112px_96px]";

function SignalTable({ signals }: { signals: Signal[] }) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-[#eef1f6] bg-white shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <div
            className={cn(
              "grid items-center gap-[16px] border-b border-[#eef1f6] px-[24px] py-[15px] text-[13px] font-medium text-[#94a3b8]",
              tableColumns,
            )}
          >
            <span>Signal</span>
            <span>Company</span>
            <span>Intent</span>
            <span>Intent Score</span>
            <span>Detected</span>
            <span />
          </div>

          <div className="divide-y divide-[#eef1f6]">
            {signals.map((signal) => (
              <div
                className={cn(
                  "grid cursor-pointer items-center gap-[16px] px-[24px] py-[18px] transition hover:bg-[#fafbff]",
                  tableColumns,
                )}
                key={signal.signalId ?? signal.title}
                onClick={() => {
                  window.location.href = signal.signalId
                    ? `/signal-detail?id=${signal.signalId}`
                    : "/signal-detail";
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex min-w-0 items-start gap-[16px]">
                  <CompanyLogo logo={signal.logo} />
                  <div className="min-w-0">
                    <p className="m-0 text-[15px] font-bold text-[#0f172a]">
                      {signal.title}
                    </p>
                    <p className="m-0 mt-[3px] text-[13px] leading-[19px] text-[#64748b]">
                      {signal.description}
                    </p>
                    <div className="mt-[10px] flex flex-wrap gap-[8px]">
                      {signal.tags.map((tag) => (
                        <Tag key={tag.label} label={tag.label} tone={tag.tone} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="m-0 truncate text-[14px] font-bold text-[#0f172a]">
                    {signal.company}
                  </p>
                  <p className="m-0 mt-[2px] truncate text-[13px] text-[#64748b]">
                    {signal.domain}
                  </p>
                  <p className="m-0 mt-[6px] flex items-center gap-[6px] text-[12px] text-[#94a3b8]">
                    <Users className="size-[14px]" />
                    {signal.size}
                  </p>
                </div>

                <div>
                  <IntentBadge level={signal.intent} />
                </div>

                <div className="flex items-center gap-[8px]">
                  <span className="text-[16px] font-bold text-[#0f172a]">
                    {signal.score}
                  </span>
                  <CheckCircle2 className="size-[17px] text-[#16a34a]" />
                </div>

                <span className="text-[13px] text-[#64748b]">{signal.detected}</span>

                <div className="flex items-center justify-end gap-[8px]">
                  <button
                    aria-label="Bookmark signal"
                    className="flex size-[38px] items-center justify-center rounded-[10px] border border-[#e9edf5] text-[#64748b] transition hover:bg-[#f6f7fb]"
                    onClick={(event) => event.stopPropagation()}
                    type="button"
                  >
                    <Bookmark className="size-[17px]" />
                  </button>
                  <button
                    aria-label="More actions"
                    className="flex size-[38px] items-center justify-center rounded-[10px] border border-[#e9edf5] text-[#64748b] transition hover:bg-[#f6f7fb]"
                    onClick={(event) => event.stopPropagation()}
                    type="button"
                  >
                    <MoreVertical className="size-[17px]" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

function PageButton({
  children,
  active = false,
  ariaLabel,
}: {
  children: ReactNode;
  active?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "flex size-[38px] items-center justify-center rounded-[10px] text-[14px] font-semibold transition",
        active
          ? "bg-[#4f46e5] text-white"
          : "border border-[#e9edf5] bg-white text-[#475569] hover:bg-[#f6f7fb]",
      )}
      type="button"
    >
      {children}
    </button>
  );
}

function Pagination() {
  return (
    <div className="relative mt-[24px] flex items-center justify-center">
      <div className="flex items-center gap-[8px]">
        <PageButton ariaLabel="Previous page">
          <ChevronLeft className="size-[17px]" />
        </PageButton>
        <PageButton active>1</PageButton>
        <PageButton>2</PageButton>
        <PageButton>3</PageButton>
        <PageButton>4</PageButton>
        <PageButton>5</PageButton>
        <span className="px-[4px] text-[14px] text-[#94a3b8]">…</span>
        <PageButton>20</PageButton>
        <PageButton ariaLabel="Next page">
          <ChevronRight className="size-[17px]" />
        </PageButton>
      </div>
      <span className="absolute right-0 hidden text-[13px] text-[#64748b] lg:block">
        Showing 1 to 20 of 392 signals
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function SignalFeedPage() {
  const [signals, setSignals] = useState<Signal[]>(dummySignals);
  const [category, setCategory] = useState("");

  useEffect(() => {
    const organisationId = getOrganisationId();
    if (!organisationId) {
      return;
    }
    listSignals(organisationId, { page: 1, page_size: 20, category: category || undefined })
      .then((res) => {
        // An explicit category filter trusts a real (possibly empty) result;
        // the unfiltered initial load keeps the dummy rows if the org has no
        // signals yet.
        if (category || res.items.length > 0) {
          setSignals(res.items.map(toSignal));
        }
      })
      .catch(() => {
        // No backend/org yet - keep the dummy rows.
      });
  }, [category]);

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Signal Intelligence" activeSub="Signal Feed" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          detectionIcon={RefreshCw}
          searchPlaceholder="Search companies, triggers, executives..."
        />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[24px]">
          <div className="flex items-center gap-[12px]">
            <h1 className="m-0 text-[26px] font-bold text-[#0f172a]">Signal Feed</h1>
            <span className="rounded-[7px] bg-[#f3e9ff] px-[10px] py-[4px] text-[12px] font-semibold text-[#7c3aed]">
              Real-time
            </span>
          </div>
          <p className="m-0 mt-[6px] text-[15px] text-[#64748b]">
            Real-time buying signals and intent data from across the digital universe.
          </p>

          <div className="mt-[22px]">
            <FilterBar category={category} onCategoryChange={setCategory} />
          </div>

          <div className="mt-[18px]">
            <SignalTable signals={signals} />
          </div>

          <Pagination />
        </main>
      </div>
    </div>
  );
}
