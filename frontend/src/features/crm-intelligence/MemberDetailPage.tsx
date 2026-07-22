import {
  BadgeCheck,
  Briefcase,
  Building2,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe2,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  Users,
  WalletCards,
} from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { getCompany, getDecisionMaker, listDecisionMakers } from "../../api/companies";
import type { CompanyOut, DecisionMakerOut } from "../../api/icp";
import { getScore, type LeadScoreOut, type NotScoredOut } from "../../api/scores";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { cn } from "../../lib/cn";
import { getOrganisationId } from "../../lib/session";

/* Member Detail shows ONLY the real decision-maker record from the uploaded
 * ZoomInfo export: name, title, department, persona (-> seniority), and
 * contact details. A DecisionMaker carries no scores, signals, or
 * time-series, so the old fabricated intent/engagement/fit charts, activity
 * timeline, AI summary, CRM pipeline, and committee cards are all removed -
 * there's nothing real to chart for a single contact. */

function getDecisionMakerIdFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("id");
}

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

type IconType = ComponentType<{ className?: string }>;

const MEMBER_COLORS = ["#6366f1", "#ec4899", "#0d9488", "#f59e0b", "#2563eb", "#ef4444", "#8b5cf6", "#0ea5e9"];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

const toneClass: Record<string, string> = {
  green: "bg-[#e7f8ef] text-[#16a34a]",
  blue: "bg-[#e6f0ff] text-[#2563eb]",
  orange: "bg-[#fff1e3] text-[#f97316]",
  purple: "bg-[#f3e9ff] text-[#7c3aed]",
  violet: "bg-[#ede9fe] text-[#6d28d9]",
  gray: "bg-[#f1f5f9] text-[#64748b]",
};

function Badge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-[6px] px-[8px] py-[3px] text-[11px] font-semibold", toneClass[tone])}>
      {label}
    </span>
  );
}

function titleize(value: string | null | undefined): string {
  if (!value) return "—";
  const acronyms = new Set(["ceo", "cfo", "cto", "coo", "cio", "ciso", "vp", "evp", "svp", "ai", "it", "hr"]);
  return value
    .split(/[_\s]+/)
    .map((w) => (acronyms.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function fullName(dm: DecisionMakerOut): string {
  return [dm.first_name, dm.last_name].filter(Boolean).join(" ") || "Unknown contact";
}

function initialsOf(value: string): string {
  return value.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value.toLocaleString()}`;
}

function isScored(score: LeadScoreOut | NotScoredOut | null): score is LeadScoreOut {
  return score !== null && "lead_score" in score;
}

function seniorityOf(persona: string): { label: string; tone: string } {
  if (/chief|ceo|cfo|cto|coo|cio|ciso|founder|president|chairman/.test(persona)) return { label: "C-Level", tone: "purple" };
  if (/vp_|evp|svp/.test(persona)) return { label: "VP", tone: "violet" };
  if (/director|managing_director/.test(persona)) return { label: "Director", tone: "blue" };
  return { label: "Manager", tone: "green" };
}

function Card({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]", className)}>
      <div className="flex items-center justify-between gap-[12px]">
        <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">{title}</h2>
        {action}
      </div>
      <div className="mt-[16px]">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function Header({ dm }: { dm: DecisionMakerOut | null }) {
  const name = dm ? [dm.first_name, dm.last_name].filter(Boolean).join(" ") || "Unknown contact" : "Loading…";
  const initials = dm ? name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "—";
  const jobTitle = dm?.job_title ?? "—";
  const persona = dm?.persona ?? "";
  const sen = seniorityOf(persona);

  return (
    <div>
      <nav className="flex flex-wrap items-center gap-[8px] text-[13px] text-[#64748b]">
        <a className="no-underline hover:text-[#334155]" href="/enterprise-list">Enterprise List</a>
        <ChevronRight className="size-[14px] text-[#cbd5e1]" />
        <span className="font-semibold text-[#0f172a]">{name}</span>
      </nav>

      <div className="mt-[16px] flex items-start gap-[16px]">
        <span
          className="flex size-[64px] shrink-0 items-center justify-center rounded-full text-[20px] font-bold text-white"
          style={{ backgroundColor: dm ? MEMBER_COLORS[hashString(name) % MEMBER_COLORS.length] : "#cbd5e1" }}
        >
          {initials}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-[10px]">
            <h1 className="m-0 text-[24px] font-bold text-[#0f172a]">{name}</h1>
            {dm && <Badge label={sen.label} tone={sen.tone} />}
          </div>
          <p className="m-0 mt-[6px] text-[14px] font-medium text-[#334155]">{jobTitle}</p>
          {persona && <p className="m-0 mt-[3px] text-[13px] text-[#64748b]">{titleize(persona)}</p>}

          {dm && (
            <div className="mt-[12px] flex flex-wrap items-center gap-[10px]">
              {dm.email && (
                <a className="flex items-center gap-[7px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[8px] text-[13px] font-semibold text-[#334155] no-underline" href={`mailto:${dm.email}`}>
                  <Mail className="size-[15px] text-[#5b3df5]" /> Email
                </a>
              )}
              {(dm.phone || dm.mobile_phone) && (
                <a className="flex items-center gap-[7px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[8px] text-[13px] font-semibold text-[#334155] no-underline" href={`tel:${dm.phone || dm.mobile_phone}`}>
                  <Phone className="size-[15px] text-[#16a34a]" /> Call
                </a>
              )}
              {dm.linkedin_url && (
                <a className="flex items-center gap-[7px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[8px] text-[13px] font-semibold text-[#334155] no-underline" href={dm.linkedin_url} rel="noreferrer" target="_blank">
                  <Linkedin className="size-[15px] text-[#0a66c2]" /> LinkedIn
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Contact information                                                 */
/* ------------------------------------------------------------------ */

type ContactRow = { icon: IconType; label: string; value: string; href?: string; copy?: boolean; external?: boolean };

function ContactInformation({ dm }: { dm: DecisionMakerOut | null }) {
  const rows: ContactRow[] = [];
  if (dm?.email) rows.push({ icon: Mail, label: "Email", value: dm.email, href: `mailto:${dm.email}`, copy: true });
  if (dm?.phone) rows.push({ icon: Phone, label: "Direct Phone", value: dm.phone, href: `tel:${dm.phone}`, copy: true });
  if (dm?.mobile_phone) rows.push({ icon: Phone, label: "Mobile", value: dm.mobile_phone, href: `tel:${dm.mobile_phone}`, copy: true });
  if (dm?.linkedin_url) rows.push({ icon: Linkedin, label: "LinkedIn", value: dm.linkedin_url, href: dm.linkedin_url, external: true });

  return (
    <Card title="Contact Information">
      {rows.length === 0 ? (
        <p className="m-0 text-[13px] text-[#94a3b8]">No contact details on file for this person.</p>
      ) : (
        <div className="flex flex-col gap-[14px]">
          {rows.map((r) => {
            const Icon = r.icon;
            return (
              <div className="flex items-center gap-[12px]" key={r.label}>
                <Icon className="size-[17px] shrink-0 text-[#94a3b8]" />
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[11px] text-[#94a3b8]">{r.label}</p>
                  {r.href ? (
                    <a className="m-0 block truncate text-[13px] font-medium text-[#2563eb] no-underline" href={r.href} rel="noreferrer" target={r.external ? "_blank" : undefined}>
                      {r.value}
                    </a>
                  ) : (
                    <p className="m-0 truncate text-[13px] font-medium text-[#334155]">{r.value}</p>
                  )}
                </div>
                {r.copy && (
                  <button aria-label={`Copy ${r.label}`} className="shrink-0" onClick={() => navigator.clipboard?.writeText(r.value)} type="button">
                    <Copy className="size-[15px] text-[#94a3b8]" />
                  </button>
                )}
                {r.external && <ExternalLink className="size-[15px] shrink-0 text-[#94a3b8]" />}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Role & background                                                   */
/* ------------------------------------------------------------------ */

function RoleBackground({ dm }: { dm: DecisionMakerOut | null }) {
  const persona = dm?.persona ?? "";
  const rows: { icon: IconType; label: string; value: string }[] = [
    { icon: Briefcase, label: "Current Role", value: dm?.job_title ?? "—" },
    { icon: Building2, label: "Department", value: dm?.department ?? "—" },
    { icon: Briefcase, label: "Persona", value: persona ? titleize(persona) : "—" },
    { icon: Briefcase, label: "Seniority", value: dm ? seniorityOf(persona).label : "—" },
    { icon: Briefcase, label: "Experience", value: dm?.years_of_experience ?? "—" },
  ];

  return (
    <Card title="Role & Background">
      <dl className="m-0 flex flex-col gap-[14px]">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <div className="flex items-center gap-[12px]" key={r.label}>
              <Icon className="size-[17px] shrink-0 text-[#94a3b8]" />
              <div className="grid flex-1 grid-cols-[110px_minmax(0,1fr)] items-center gap-[10px]">
                <dt className="text-[12px] text-[#94a3b8]">{r.label}</dt>
                <dd className="m-0 text-[13px] font-semibold text-[#334155]">{r.value}</dd>
              </div>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Company                                                             */
/* ------------------------------------------------------------------ */

function leadScoreBadge(score: number): { label: string; tone: string } {
  if (score >= 80) return { label: "Very High", tone: "green" };
  if (score >= 60) return { label: "High", tone: "blue" };
  if (score >= 40) return { label: "Medium", tone: "orange" };
  return { label: "Low", tone: "gray" };
}

function CompanyCard({
  company,
  score,
  companyId,
}: {
  company: CompanyOut | null;
  score: LeadScoreOut | NotScoredOut | null;
  companyId: string | null;
}) {
  const scored = isScored(score);
  const leadScore = scored && score.lead_score !== null ? Math.round(score.lead_score) : null;
  const detailHref = companyId ? `/enterprise-detail?id=${companyId}` : "/enterprise-detail";

  const rows: { icon: IconType; label: string; value: string; href?: string }[] = [
    { icon: Building2, label: "Industry", value: company?.industries?.[0] ?? "—" },
    { icon: Users, label: "Employees", value: company?.employee_count ? company.employee_count.toLocaleString() : company?.employee_range ?? "—" },
    { icon: WalletCards, label: "Revenue", value: company?.revenue_usd ? formatUsd(company.revenue_usd) : company?.revenue_range ?? "—" },
    { icon: MapPin, label: "Headquarters", value: [company?.city, company?.state, company?.country].filter(Boolean).join(", ") || "—" },
    {
      icon: Globe2,
      label: "Website",
      value: company?.company_domain ?? "—",
      href: company?.company_domain ? `https://${company.company_domain}` : undefined,
    },
  ];

  return (
    <Card
      action={
        <a className="flex items-center gap-[4px] text-[12px] font-semibold text-[#5b3df5] no-underline" href={detailHref}>
          View company <ChevronRight className="size-[13px]" />
        </a>
      }
      title="Company"
    >
      <div className="flex items-center gap-[14px] border-b border-[#f1f5f9] pb-[16px]">
        <span className="flex size-[46px] shrink-0 items-center justify-center rounded-[12px] bg-[#0f172a] text-[14px] font-bold text-white">
          {company ? initialsOf(company.company_name) : "—"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-[8px]">
            <a className="truncate text-[15px] font-bold text-[#0f172a] no-underline hover:text-[#5b3df5]" href={detailHref}>
              {company?.company_name ?? "—"}
            </a>
            {company?.is_verified && <BadgeCheck className="size-[16px] shrink-0 text-[#16a34a]" />}
          </div>
          <div className="mt-[4px] flex items-center gap-[8px]">
            {leadScore !== null ? (
              <>
                <span className="text-[13px] font-semibold text-[#334155]">Lead Score {leadScore}</span>
                <Badge label={leadScoreBadge(leadScore).label} tone={leadScoreBadge(leadScore).tone} />
              </>
            ) : (
              <span className="text-[13px] text-[#94a3b8]">Not scored yet</span>
            )}
          </div>
        </div>
      </div>

      <dl className="m-0 mt-[16px] flex flex-col gap-[14px]">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <div className="flex items-center gap-[12px]" key={r.label}>
              <Icon className="size-[17px] shrink-0 text-[#94a3b8]" />
              <div className="grid flex-1 grid-cols-[110px_minmax(0,1fr)] items-center gap-[10px]">
                <dt className="text-[12px] text-[#94a3b8]">{r.label}</dt>
                {r.href ? (
                  <dd className="m-0 truncate text-[13px] font-semibold text-[#2563eb]">
                    <a className="no-underline" href={r.href} rel="noreferrer" target="_blank">{r.value}</a>
                  </dd>
                ) : (
                  <dd className="m-0 truncate text-[13px] font-semibold text-[#334155]">{r.value}</dd>
                )}
              </div>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Other committee members                                             */
/* ------------------------------------------------------------------ */

function CommitteeColleagues({ colleagues, companyId }: { colleagues: DecisionMakerOut[]; companyId: string | null }) {
  const committeeHref = companyId ? `/buying-committee?id=${companyId}` : "/buying-committee";
  return (
    <Card
      action={
        colleagues.length > 0 ? (
          <a className="flex items-center gap-[4px] text-[12px] font-semibold text-[#5b3df5] no-underline" href={committeeHref}>
            View all <ChevronRight className="size-[13px]" />
          </a>
        ) : undefined
      }
      title={`Other Committee Members${colleagues.length ? ` (${colleagues.length})` : ""}`}
    >
      {colleagues.length === 0 ? (
        <p className="m-0 text-[13px] text-[#94a3b8]">No other decision-makers on file for this company.</p>
      ) : (
        <div className="flex flex-col gap-[14px]">
          {colleagues.slice(0, 8).map((c) => {
            const name = fullName(c);
            const sen = seniorityOf(c.persona ?? "");
            return (
              <a
                className="flex items-center gap-[12px] no-underline"
                href={`/member-detail?id=${c.decision_maker_id}`}
                key={c.decision_maker_id}
              >
                <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: MEMBER_COLORS[hashString(name) % MEMBER_COLORS.length] }}>
                  {initialsOf(name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[13px] font-bold text-[#0f172a]">{name}</p>
                  <p className="m-0 truncate text-[12px] text-[#94a3b8]">{c.job_title ?? "—"}</p>
                </div>
                <Badge label={sen.label} tone={sen.tone} />
              </a>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function MemberDetailPage() {
  const [dm, setDm] = useState<DecisionMakerOut | null>(null);
  const [company, setCompany] = useState<CompanyOut | null>(null);
  const [score, setScore] = useState<LeadScoreOut | NotScoredOut | null>(null);
  const [colleagues, setColleagues] = useState<DecisionMakerOut[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const organisationId = getOrganisationId();
    const decisionMakerId = getDecisionMakerIdFromUrl();
    if (!organisationId || !decisionMakerId) {
      setNotFound(true);
      return;
    }
    getDecisionMaker(organisationId, decisionMakerId)
      .then((res) => {
        setDm(res);
        // The person's company is the real context that fills out this page -
        // firmographics, lead score, and the rest of the buying committee.
        getCompany(organisationId, res.company_id).then(setCompany).catch(() => setCompany(null));
        getScore(organisationId, res.company_id).then(setScore).catch(() => setScore(null));
        listDecisionMakers(organisationId, res.company_id)
          .then((all) => setColleagues(all.filter((c) => c.decision_maker_id !== res.decision_maker_id)))
          .catch(() => setColleagues([]));
      })
      .catch(() => setNotFound(true));
  }, []);

  const companyId = dm?.company_id ?? null;

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
          <Header dm={dm} />

          {notFound && !dm ? (
            <p className="mt-[24px] text-[14px] font-medium text-[#64748b]">This contact could not be found.</p>
          ) : (
            <div className="mt-[22px] grid grid-cols-1 gap-[20px] xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="flex flex-col gap-[20px]">
                <div className="grid grid-cols-1 gap-[20px] lg:grid-cols-2">
                  <ContactInformation dm={dm} />
                  <RoleBackground dm={dm} />
                </div>
                <CompanyCard company={company} companyId={companyId} score={score} />
              </div>

              <div className="flex flex-col gap-[20px]">
                <CommitteeColleagues colleagues={colleagues} companyId={companyId} />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
