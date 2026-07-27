import {
  BadgeCheck,
  ChevronRight,
  Facebook,
  Linkedin,
  Mail,
  Phone,
  Radio,
  Twitter,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { cn } from "../../lib/cn";
import { getCompany } from "../../api/companies";
import { getScore, type LeadScoreOut, type NotScoredOut } from "../../api/scores";
import { getSignals, type SignalOut } from "../../api/signals";
import type { CompanyOut, DecisionMakerOut } from "../../api/icp";
import { getOrganisationId } from "../../lib/session";

/* Enterprise Detail shows ONLY data that comes from the uploaded ZoomInfo
 * export + the scoring pipeline: firmographics, funding, the real lead score,
 * the company's decision-makers, and its extracted signals. The previous
 * version was mostly fabricated (fake account/engagement scores, invented
 * charts, tech stack, relationship map, news, timeline) - none of which the
 * backend has, so they've been removed rather than shown as real. */

function getCompanyIdFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("id");
}

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

function isScored(s: LeadScoreOut | NotScoredOut | null): s is LeadScoreOut {
  return s !== null && "lead_score" in s;
}

function formatUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const ACRONYMS = new Set(["ceo", "cto", "cfo", "coo", "cio", "ciso", "chro", "vp", "evp", "svp", "ai", "it", "hr"]);

function titleize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .split(/[_\s]+/)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function fullName(dm: DecisionMakerOut): string {
  return [dm.first_name, dm.last_name].filter(Boolean).join(" ") || "Unknown contact";
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const toneClass: Record<string, string> = {
  green: "bg-[#e7f8ef] text-[#16a34a]",
  blue: "bg-[#e6f0ff] text-[#2563eb]",
  orange: "bg-[#fff1e3] text-[#f97316]",
  purple: "bg-[#f3e9ff] text-[#7c3aed]",
  gray: "bg-[#f1f5f9] text-[#64748b]",
};

function Badge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-[6px] px-[8px] py-[3px] text-[11px] font-semibold", toneClass[tone])}>
      {label}
    </span>
  );
}

function Card({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]", className)}>
      <div className="flex items-center justify-between gap-[10px]">
        <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">{title}</h2>
        {action}
      </div>
      <div className="mt-[14px]">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function Header({
  company,
  score,
  companyId,
}: {
  company: CompanyOut | null;
  score: LeadScoreOut | NotScoredOut | null;
  companyId: string | null;
}) {
  const name = company?.company_name ?? "Company";
  const industry = company?.industries?.[0] ?? company?.primary_industry?.[0] ?? "—";
  const location = [company?.city, company?.country].filter(Boolean).join(", ") || "—";
  const website = company?.company_domain ?? null;
  const scored = isScored(score);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-[12px]">
        <nav className="flex items-center gap-[8px] text-[13px]">
          <a className="text-[#64748b] no-underline hover:text-[#334155]" href="/enterprise-list">
            Enterprise List
          </a>
          <ChevronRight className="size-[14px] text-[#cbd5e1]" />
          <span className="font-semibold text-[#0f172a]">{name}</span>
        </nav>
      </div>

      <div className="mt-[16px] flex flex-col gap-[16px] 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="flex items-start gap-[16px]">
          <span className="flex size-[64px] shrink-0 items-center justify-center rounded-[14px] bg-[#0f172a] text-[20px] font-bold text-white">
            {company ? initialsOf(company.company_name) : "—"}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-[10px]">
              <h1 className="m-0 text-[24px] font-bold text-[#0f172a]">{name}</h1>
              {company?.is_verified && (
                <span className="inline-flex items-center gap-[4px] text-[12px] font-semibold text-[#16a34a]">
                  <BadgeCheck className="size-[16px]" /> Verified
                </span>
              )}
              {company?.ownership_type && <Badge label={titleize(company.ownership_type)} tone="gray" />}
            </div>
            <p className="m-0 mt-[6px] flex flex-wrap items-center gap-[8px] text-[13px] text-[#64748b]">
              <span>{industry}</span>
              <span>•</span>
              <span>{location}</span>
              {website && (
                <>
                  <span>•</span>
                  <a className="font-medium text-[#2563eb] no-underline" href={`https://${website}`} rel="noreferrer" target="_blank">
                    {website}
                  </a>
                </>
              )}
              {company?.linkedin_url && (
                <a href={company.linkedin_url} rel="noreferrer" target="_blank">
                  <Linkedin className="size-[15px] text-[#0a66c2]" />
                </a>
              )}
              {company?.twitter_url && (
                <a href={company.twitter_url} rel="noreferrer" target="_blank">
                  <Twitter className="size-[15px] text-[#1da1f2]" />
                </a>
              )}
              {company?.facebook_url && (
                <a href={company.facebook_url} rel="noreferrer" target="_blank">
                  <Facebook className="size-[15px] text-[#1877f2]" />
                </a>
              )}
            </p>
          </div>
        </div>

        {/* Real lead score summary - clicking opens the full breakdown. */}
        <button
          className="flex items-center gap-[20px] rounded-[16px] border border-[#eef1f6] bg-white px-[22px] py-[16px] text-left shadow-[0px_1px_2px_rgba(15,23,42,0.04)] hover:bg-[#fafbff]"
          onClick={() => {
            window.location.href = companyId ? `/score-breakdown?id=${companyId}` : "/score-breakdown";
          }}
          type="button"
        >
          <div>
            <p className="m-0 text-[12px] text-[#94a3b8]">Lead Score</p>
            <p className="m-0 mt-[4px] text-[28px] font-bold leading-none text-[#0f172a]">
              {scored && score.lead_score !== null ? Math.round(score.lead_score) : "—"}
            </p>
          </div>
          <div className="border-l border-[#eef1f6] pl-[20px]">
            <p className="m-0 text-[12px] text-[#94a3b8]">Sales Status</p>
            <div className="mt-[6px]">
              {scored && score.sales_status ? (
                <Badge label={score.sales_status} tone={score.sales_status === "Sales Ready" || score.sales_status === "High Priority" ? "green" : "orange"} />
              ) : (
                <Badge label="Not scored" tone="gray" />
              )}
            </div>
          </div>
          <div className="border-l border-[#eef1f6] pl-[20px]">
            <p className="m-0 text-[12px] text-[#94a3b8]">Confidence</p>
            <p className="m-0 mt-[4px] text-[16px] font-bold text-[#0f172a]">
              {scored ? score.confidence_label ?? "—" : "—"}
            </p>
          </div>
          <div className="border-l border-[#eef1f6] pl-[20px]">
            <p className="m-0 text-[12px] text-[#94a3b8]">Est. Deal Value</p>
            <p className="m-0 mt-[4px] text-[16px] font-bold text-[#0f172a]">
              {scored ? formatUsd(score.expected_deal_value_usd) : "—"}
            </p>
          </div>
          <ChevronRight className="size-[18px] text-[#cbd5e1]" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Firmographics                                                       */
/* ------------------------------------------------------------------ */

function Firmographics({ company }: { company: CompanyOut | null }) {
  const rows: { label: string; value: ReactNode }[] = [
    { label: "Industry", value: company?.industries?.join(", ") || company?.primary_industry?.join(", ") || "—" },
    {
      label: "Employees",
      value: company?.employee_count
        ? `${company.employee_count.toLocaleString()}${company.employee_range ? ` (${company.employee_range})` : ""}`
        : company?.employee_range || "—",
    },
    { label: "Revenue", value: company?.revenue_usd ? formatUsd(company.revenue_usd) : company?.revenue_range || "—" },
    { label: "Founded", value: company?.founded_year || "—" },
    { label: "Ownership", value: company?.ownership_type ? titleize(company.ownership_type) : "—" },
    { label: "Status", value: company?.company_status ? titleize(company.company_status) : "—" },
    { label: "Headquarters", value: [company?.city, company?.state, company?.country].filter(Boolean).join(", ") || "—" },
  ];

  return (
    <Card title="Firmographics">
      <dl className="m-0 flex flex-col gap-[12px]">
        {rows.map((r) => (
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-[10px]" key={r.label}>
            <dt className="text-[12px] text-[#94a3b8]">{r.label}</dt>
            <dd className="m-0 text-[13px] font-semibold text-[#334155]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Funding                                                             */
/* ------------------------------------------------------------------ */

function Funding({ company }: { company: CompanyOut | null }) {
  const hasFunding =
    company &&
    (company.total_funding_amount != null || company.recent_funding_amount != null || company.recent_funding_date != null);

  return (
    <Card title="Funding">
      {hasFunding ? (
        <dl className="m-0 flex flex-col gap-[12px]">
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-[10px]">
            <dt className="text-[12px] text-[#94a3b8]">Total Funding</dt>
            <dd className="m-0 text-[13px] font-semibold text-[#334155]">{formatUsd(company!.total_funding_amount)}</dd>
          </div>
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-[10px]">
            <dt className="text-[12px] text-[#94a3b8]">Recent Round</dt>
            <dd className="m-0 text-[13px] font-semibold text-[#334155]">{formatUsd(company!.recent_funding_amount)}</dd>
          </div>
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-[10px]">
            <dt className="text-[12px] text-[#94a3b8]">Round Date</dt>
            <dd className="m-0 text-[13px] font-semibold text-[#334155]">{formatDate(company!.recent_funding_date)}</dd>
          </div>
        </dl>
      ) : (
        <p className="m-0 text-[13px] text-[#94a3b8]">No funding data for this company.</p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Lead Score summary                                                  */
/* ------------------------------------------------------------------ */

function LeadScoreSummary({ score, companyId }: { score: LeadScoreOut | NotScoredOut | null; companyId: string | null }) {
  const action = (
    <button
      className="flex items-center gap-[4px] text-[12px] font-semibold text-[#5b3df5]"
      onClick={() => {
        window.location.href = companyId ? `/score-breakdown?id=${companyId}` : "/score-breakdown";
      }}
      type="button"
    >
      Full breakdown <ChevronRight className="size-[13px]" />
    </button>
  );

  if (!isScored(score)) {
    return (
      <Card title="Lead Score">
        <p className="m-0 text-[13px] text-[#94a3b8]">
          Not scored yet. Run scoring from the Enterprise List to analyse this company.
        </p>
      </Card>
    );
  }

  const metrics: { label: string; value: string }[] = [
    { label: "Lead Score", value: score.lead_score !== null ? String(Math.round(score.lead_score)) : "—" },
    { label: "Sales Status", value: score.sales_status ?? "—" },
    { label: "Buying Evidence", value: score.buying_evidence_score !== null ? String(Math.round(score.buying_evidence_score)) : "—" },
    { label: "Contact Access", value: score.contact_access_score !== null ? String(Math.round(score.contact_access_score)) : "—" },
    { label: "Negative Penalty", value: score.negative_event_score !== null ? String(Math.round(score.negative_event_score)) : "—" },
    { label: "Confidence", value: score.confidence_label ?? "—" },
  ];

  return (
    <Card action={action} title="Lead Score">
      <div className="grid grid-cols-2 gap-[12px]">
        {metrics.map((m) => (
          <div className="rounded-[10px] bg-[#f8fafc] p-[12px]" key={m.label}>
            <p className="m-0 text-[11px] text-[#94a3b8]">{m.label}</p>
            <p className="m-0 mt-[4px] text-[18px] font-bold text-[#0f172a]">{m.value}</p>
          </div>
        ))}
      </div>
      {score.best_offering && (
        <div className="mt-[14px]">
          <p className="m-0 text-[12px] text-[#94a3b8]">Best XSparks offering</p>
          <p className="m-0 mt-[3px] text-[13px] font-semibold text-[#334155]">{score.best_offering}</p>
        </div>
      )}
      {score.why_now && (
        <div className="mt-[10px]">
          <p className="m-0 text-[12px] text-[#94a3b8]">Why now</p>
          <p className="m-0 mt-[3px] text-[13px] text-[#475569]">{score.why_now}</p>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Buying Committee (real decision makers)                             */
/* ------------------------------------------------------------------ */

function BuyingCommittee({ company, companyId }: { company: CompanyOut | null; companyId: string | null }) {
  const members = company?.decision_makers ?? [];
  const action =
    members.length > 0 ? (
      <button
        className="flex items-center gap-[4px] text-[12px] font-semibold text-[#5b3df5]"
        onClick={() => {
          window.location.href = companyId ? `/buying-committee?id=${companyId}` : "/buying-committee";
        }}
        type="button"
      >
        View all <ChevronRight className="size-[13px]" />
      </button>
    ) : undefined;

  return (
    <Card action={action} title={`Buying Committee${members.length ? ` (${members.length})` : ""}`}>
      {members.length === 0 ? (
        <p className="m-0 flex items-center gap-[8px] text-[13px] text-[#94a3b8]">
          <Users className="size-[15px]" /> No contacts on this company.
        </p>
      ) : (
        <div className="flex flex-col gap-[14px]">
          {members.slice(0, 8).map((dm) => (
            <div className="flex items-center gap-[12px]" key={dm.decision_maker_id}>
              <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-[#0f172a] text-[12px] font-bold text-white">
                {initialsOf(fullName(dm))}
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[13px] font-bold text-[#0f172a]">{fullName(dm)}</p>
                <p className="m-0 truncate text-[12px] text-[#64748b]">
                  {dm.job_title || "—"}
                  {dm.persona ? ` · ${titleize(dm.persona)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-[10px]">
                {dm.email && (
                  <a href={`mailto:${dm.email}`} title={dm.email}>
                    <Mail className="size-[15px] text-[#64748b]" />
                  </a>
                )}
                {(dm.phone || dm.mobile_phone) && <Phone className="size-[15px] text-[#64748b]" />}
                {dm.linkedin_url && (
                  <a href={dm.linkedin_url} rel="noreferrer" target="_blank">
                    <Linkedin className="size-[15px] text-[#0a66c2]" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Company Signals (real extracted signals)                            */
/* ------------------------------------------------------------------ */

const categoryTone: Record<string, string> = {
  ai_seriousness: "purple",
  ai_pain_points: "orange",
  buying_stage: "blue",
  budget_and_capital: "green",
  urgency_and_catalysts: "orange",
  competitive_context: "gray",
  company_identity: "gray",
  reachability: "blue",
};

function CompanySignals({ signals }: { signals: SignalOut[] }) {
  const positive = signals.filter((s) => !s.is_negative);
  const sorted = [...positive].sort((a, b) => (b.event_score ?? 0) - (a.event_score ?? 0));

  return (
    <Card title={`Buying Events${positive.length ? ` (${positive.length})` : ""}`}>
      {positive.length === 0 ? (
        <p className="m-0 flex items-center gap-[8px] text-[13px] text-[#94a3b8]">
          <Radio className="size-[15px] text-[#64748b]" /> No buying events found for this company yet.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-[#f1f5f9]">
          {sorted.slice(0, 12).map((s) => (
            <div className="flex items-center gap-[12px] py-[12px] first:pt-0" key={s.buying_event_id}>
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[#eef1ff] text-[#5b3df5]">
                <Radio className="size-[16px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[13px] font-bold text-[#0f172a]">{s.title || titleize(s.event_type)}</p>
                <p className="m-0 truncate text-[12px] text-[#64748b]">
                  {s.summary || titleize(s.category ?? undefined)}
                </p>
              </div>
              <Badge label={titleize(s.category ?? undefined)} tone={categoryTone[s.category ?? ""] ?? "gray"} />
              <div className="w-[70px] shrink-0 text-right">
                <p className="m-0 text-[12px] font-bold text-[#0f172a]">
                  {s.event_score !== null ? Math.round(s.event_score) : "—"}
                </p>
                <p className="m-0 text-[11px] text-[#94a3b8]">{relativeTime(s.published_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function EnterpriseDetailPage() {
  const [company, setCompany] = useState<CompanyOut | null>(null);
  const [score, setScore] = useState<LeadScoreOut | NotScoredOut | null>(null);
  const [signals, setSignals] = useState<SignalOut[]>([]);
  const companyId = getCompanyIdFromUrl();

  useEffect(() => {
    const organisationId = getOrganisationId();
    if (!organisationId || !companyId) {
      return;
    }
    getCompany(organisationId, companyId).then(setCompany).catch(() => setCompany(null));
    getScore(organisationId, companyId).then(setScore).catch(() => setScore(null));
    getSignals(organisationId, companyId).then(setSignals).catch(() => setSignals([]));
  }, [companyId]);

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Enterprise List" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          searchPlaceholder="Search companies, triggers, executives..."
          showDetection={false}
          showNotificationBell={false}
        />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          <Header company={company} companyId={companyId} score={score} />

          <div className="mt-[22px] grid grid-cols-1 gap-[20px] lg:grid-cols-3">
            <Firmographics company={company} />
            <Funding company={company} />
            <LeadScoreSummary companyId={companyId} score={score} />
          </div>

          <div className="mt-[20px] grid grid-cols-1 gap-[20px] lg:grid-cols-[1fr_1.3fr]">
            <BuyingCommittee company={company} companyId={companyId} />
            <CompanySignals signals={signals} />
          </div>
        </main>
      </div>
    </div>
  );
}
