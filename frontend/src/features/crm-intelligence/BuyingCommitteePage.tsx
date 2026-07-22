import { CheckCircle2, ChevronRight, Linkedin, Mail, Phone, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Donut } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";
import { getCompany, listDecisionMakers } from "../../api/companies";
import type { CompanyOut, DecisionMakerOut } from "../../api/icp";
import { getScore, type LeadScoreOut, type NotScoredOut } from "../../api/scores";
import { getOrganisationId } from "../../lib/session";

/* Buying Committee shows ONLY real decision-maker data from the uploaded
 * ZoomInfo export: each contact's name, title, department, seniority (derived
 * from the real persona), and contact details, plus the company's real lead
 * score. The old fabricated bits (engagement/fit/opportunity scores,
 * influence/last-activity/relationship/champion columns, dummy people,
 * non-functional tabs and pagination) are removed - nothing backs them. */

function getCompanyIdFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("id");
}

function isScored(score: LeadScoreOut | NotScoredOut | null): score is LeadScoreOut {
  return score !== null && "lead_score_id" in score;
}

const MEMBER_COLORS = ["#6366f1", "#ec4899", "#0d9488", "#f59e0b", "#2563eb", "#ef4444", "#8b5cf6", "#0ea5e9"];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

type Member = {
  decisionMakerId: string;
  initials: string;
  bg: string;
  name: string;
  role: string;
  dept: string;
  persona: string;
  seniority: string;
  senTone: string;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
};

function seniorityOf(persona: string): { label: string; tone: string } {
  if (/chief|ceo|cfo|cto|coo|cio|ciso|founder|president|chairman/.test(persona)) return { label: "C-Level", tone: "purple" };
  if (/vp_|evp|svp/.test(persona)) return { label: "VP", tone: "violet" };
  if (/director|managing_director/.test(persona)) return { label: "Director", tone: "blue" };
  return { label: "Manager", tone: "green" };
}

function toMember(dm: DecisionMakerOut): Member {
  const name = [dm.first_name, dm.last_name].filter(Boolean).join(" ") || "Unknown contact";
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const persona = dm.persona ?? "";
  const sen = seniorityOf(persona);
  return {
    decisionMakerId: dm.decision_maker_id,
    initials: initials || "?",
    bg: MEMBER_COLORS[hashString(name) % MEMBER_COLORS.length],
    name,
    role: dm.job_title ?? "—",
    dept: dm.department ?? "—",
    persona,
    seniority: sen.label,
    senTone: sen.tone,
    email: dm.email,
    phone: dm.phone ?? dm.mobile_phone,
    linkedin: dm.linkedin_url,
  };
}

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

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

function accountScoreBadge(score: number): { label: string; tone: string } {
  if (score >= 80) return { label: "Very High", tone: "green" };
  if (score >= 60) return { label: "High", tone: "blue" };
  if (score >= 40) return { label: "Medium", tone: "orange" };
  return { label: "Low", tone: "gray" };
}

function formatUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function Header({
  company,
  score,
  members,
  companyId,
}: {
  company: CompanyOut | null;
  score: LeadScoreOut | NotScoredOut | null;
  members: Member[];
  companyId: string | null;
}) {
  const name = company?.company_name ?? "Company";
  const initials = company ? name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "—";
  const industry = company?.industries?.[0] ?? "—";
  const location = [company?.city, company?.country].filter(Boolean).join(", ") || "—";
  const website = company?.company_domain ?? null;
  const detailHref = companyId ? `/enterprise-detail?id=${companyId}` : "/enterprise-detail";

  const scored = isScored(score);
  const accountScore = scored && score.lead_score !== null ? Math.round(score.lead_score) : null;
  const gateStatus = scored ? score.gate_status : null;
  const reachable = members.filter((m) => m.email).length;

  const stats: { label: string; value: string; badge?: { label: string; tone: string } }[] = [
    {
      label: "Account Score",
      value: accountScore !== null ? String(accountScore) : "—",
      badge: accountScore !== null ? accountScoreBadge(accountScore) : undefined,
    },
    { label: "Committee Size", value: String(members.length) },
    { label: "Reachable Contacts", value: `${reachable} / ${members.length}` },
    { label: "Est. Deal Value", value: scored ? formatUsd(score.expected_deal_value_usd) : "—" },
  ];

  return (
    <div>
      <nav className="flex flex-wrap items-center gap-[8px] text-[13px] text-[#64748b]">
        <a className="no-underline hover:text-[#334155]" href="/enterprise-list">Enterprise List</a>
        <ChevronRight className="size-[14px] text-[#cbd5e1]" />
        <a className="no-underline hover:text-[#334155]" href={detailHref}>{name}</a>
        <ChevronRight className="size-[14px] text-[#cbd5e1]" />
        <span className="font-semibold text-[#0f172a]">Buying Committee</span>
      </nav>
      <h1 className="m-0 mt-[10px] text-[26px] font-bold text-[#0f172a]">Buying Committee</h1>
      <p className="m-0 mt-[6px] text-[15px] text-[#64748b]">
        The decision-makers identified at this company from your uploaded data.
      </p>

      <div className="mt-[18px] flex flex-col gap-[16px] 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex items-start gap-[16px]">
          <span className="flex size-[58px] shrink-0 items-center justify-center rounded-[14px] bg-[#0f172a] text-[18px] font-bold text-white">{initials}</span>
          <div>
            <div className="flex flex-wrap items-center gap-[10px]">
              <h2 className="m-0 text-[20px] font-bold text-[#0f172a]">{name}</h2>
              {gateStatus && <Badge label={gateStatus === "active" ? "Active" : "Nurture"} tone={gateStatus === "active" ? "green" : "orange"} />}
            </div>
            <p className="m-0 mt-[5px] flex flex-wrap items-center gap-[8px] text-[13px] text-[#64748b]">
              <span>{industry}</span>
              <span>•</span>
              <span>{location}</span>
              {website && (
                <>
                  <span>•</span>
                  <a className="font-medium text-[#2563eb] no-underline" href={`https://${website}`} rel="noreferrer" target="_blank">{website}</a>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-[#eef1f6] bg-[#eef1f6] md:grid-cols-4">
          {stats.map((s) => (
            <div className="bg-white p-[14px]" key={s.label}>
              <p className="m-0 text-[12px] text-[#94a3b8]">{s.label}</p>
              <div className="mt-[6px] flex items-center gap-[8px]">
                <span className="text-[20px] font-bold leading-none text-[#0f172a]">{s.value}</span>
                {s.badge && <Badge label={s.badge.label} tone={s.badge.tone} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Members table                                                       */
/* ------------------------------------------------------------------ */

const cols = "grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_0.9fr_1fr]";

function MembersTable({ members }: { members: Member[] }) {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="mb-[14px] flex items-center justify-between gap-[12px]">
        <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Committee Members</h2>
        {members.length > 0 && <span className="text-[13px] text-[#64748b]">{members.length} identified</span>}
      </div>

      {members.length === 0 ? (
        <p className="m-0 py-[36px] text-center text-[13px] text-[#94a3b8]">
          No decision-makers identified for this company yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className={cn("grid items-center gap-[12px] border-b border-[#eef1f6] pb-[12px] text-[12px] font-semibold text-[#94a3b8]", cols)}>
              <span>Member</span>
              <span>Department</span>
              <span>Seniority</span>
              <span>Contact</span>
            </div>

            <div className="divide-y divide-[#f1f5f9]">
              {members.map((m) => (
                <div
                  className={cn("grid cursor-pointer items-center gap-[12px] rounded-[8px] px-[6px] py-[13px] transition hover:bg-[#fafbff]", cols)}
                  key={m.decisionMakerId}
                  onClick={() => {
                    window.location.href = `/member-detail?id=${m.decisionMakerId}`;
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex min-w-0 items-center gap-[12px]">
                    <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: m.bg }}>
                      {m.initials}
                    </span>
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[14px] font-semibold text-[#0f172a]">{m.name}</p>
                      <p className="m-0 truncate text-[12px] text-[#94a3b8]">{m.role}</p>
                    </div>
                  </div>

                  <span className="truncate text-[13px] text-[#334155]">{m.dept}</span>

                  <span><Badge label={m.seniority} tone={m.senTone} /></span>

                  <div className="flex items-center gap-[10px]" onClick={(e) => e.stopPropagation()} role="presentation">
                    {m.email ? (
                      <a href={`mailto:${m.email}`} title={m.email}><Mail className="size-[16px] text-[#64748b]" /></a>
                    ) : (
                      <Mail className="size-[16px] text-[#e2e8f0]" />
                    )}
                    {m.phone ? (
                      <a href={`tel:${m.phone}`} title={m.phone}><Phone className="size-[16px] text-[#64748b]" /></a>
                    ) : (
                      <Phone className="size-[16px] text-[#e2e8f0]" />
                    )}
                    {m.linkedin ? (
                      <a href={m.linkedin} rel="noreferrer" target="_blank"><Linkedin className="size-[16px] text-[#0a66c2]" /></a>
                    ) : (
                      <Linkedin className="size-[16px] text-[#e2e8f0]" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Right rail                                                          */
/* ------------------------------------------------------------------ */

/* Every bullet is computed straight from the real decision-maker rows -
 * count, C-level names, top department, email reachability - not fabricated
 * per-name engagement prose. */
function buildInsights(members: Member[], companyName: string): string[] {
  if (members.length === 0) {
    return [`No decision-makers identified yet for ${companyName}.`];
  }
  const bullets = [`${members.length} committee member${members.length === 1 ? "" : "s"} identified for ${companyName}.`];

  const cLevel = members.filter((m) => m.seniority === "C-Level");
  if (cLevel.length > 0) {
    bullets.push(`${cLevel.length} C-level contact${cLevel.length === 1 ? "" : "s"}: ${cLevel.map((m) => m.name).join(", ")}.`);
  }

  const deptCounts = new Map<string, number>();
  members.forEach((m) => {
    if (m.dept !== "—") deptCounts.set(m.dept, (deptCounts.get(m.dept) ?? 0) + 1);
  });
  const topDept = [...deptCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topDept) {
    bullets.push(`${topDept[0]} has the most identified contacts (${topDept[1]}).`);
  }

  const reachable = members.filter((m) => m.email).length;
  bullets.push(`${reachable} of ${members.length} contact${members.length === 1 ? "" : "s"} ${reachable === 1 ? "has" : "have"} a direct email on file.`);
  return bullets;
}

function CommitteeInsights({ members, companyName }: { members: Member[]; companyName: string }) {
  const bullets = buildInsights(members, companyName);
  return (
    <section className="rounded-[16px] border border-[#eee9ff] bg-[#faf8ff] p-[20px]">
      <h2 className="m-0 flex items-center gap-[8px] text-[15px] font-bold text-[#0f172a]">
        <Sparkles className="size-[17px] text-[#7c3aed]" /> Committee Insights
      </h2>
      <div className="mt-[14px] flex flex-col gap-[12px]">
        {bullets.map((b) => (
          <div className="flex gap-[10px]" key={b}>
            <CheckCircle2 className="mt-[1px] size-[16px] shrink-0 text-[#16a34a]" />
            <p className="m-0 text-[13px] leading-[19px] text-[#475569]">{b}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const SENIORITY_COLORS: Record<string, string> = {
  "C-Level": "#6366f1",
  VP: "#8b5cf6",
  Director: "#f97316",
  Manager: "#ec4899",
};

type DistributionSlice = { label: string; pct: string; value: number; color: string };

/* Seniority tier is real (derived from the decision maker's real persona). */
function buildSeniorityDistribution(members: Member[]): DistributionSlice[] {
  const counts = new Map<string, number>();
  members.forEach((m) => counts.set(m.seniority, (counts.get(m.seniority) ?? 0) + 1));
  const total = members.length || 1;
  return [...counts.entries()].map(([label, value]) => ({
    label: `${label} (${value})`,
    pct: `${Math.round((value / total) * 100)}%`,
    value,
    color: SENIORITY_COLORS[label] ?? "#94a3b8",
  }));
}

function SeniorityDistribution({ members }: { members: Member[] }) {
  const slices = buildSeniorityDistribution(members);
  if (members.length === 0) {
    return null;
  }
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">Seniority Distribution</h2>
      <div className="mt-[14px] flex items-center gap-[18px]">
        <div className="relative size-[104px] shrink-0">
          <Donut segments={slices.map((s) => ({ value: s.value, color: s.color }))} size={104} thickness={16} />
        </div>
        <div className="flex flex-1 flex-col gap-[12px]">
          {slices.map((s) => (
            <div className="flex items-center justify-between gap-[10px]" key={s.label}>
              <span className="flex items-center gap-[8px] text-[13px] font-medium text-[#334155]">
                <span className="size-[9px] rounded-full" style={{ backgroundColor: s.color }} /> {s.label}
              </span>
              <span className="text-[13px] font-semibold text-[#0f172a]">{s.pct}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const DEPT_COLORS = ["#7c3aed", "#2563eb", "#0d9488", "#f59e0b", "#ec4899", "#ef4444", "#16a34a", "#94a3b8"];

function buildDeptDistribution(members: Member[]): { label: string; count: string; value: number; color: string }[] {
  const counts = new Map<string, number>();
  members.forEach((m) => {
    const key = m.dept === "—" ? "Unspecified" : m.dept;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const total = members.length || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({
      label,
      count: `${value} (${Math.round((value / total) * 100)}%)`,
      value,
      color: DEPT_COLORS[i % DEPT_COLORS.length],
    }));
}

function RoleDistribution({ members }: { members: Member[] }) {
  const roles = buildDeptDistribution(members);
  const maxVal = Math.max(1, ...roles.map((r) => r.value));
  if (members.length === 0) {
    return null;
  }
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">Department Distribution</h2>
      <div className="mt-[14px] flex flex-col gap-[12px]">
        {roles.map((r) => (
          <div className="flex items-center gap-[12px]" key={r.label}>
            <span className="w-[110px] shrink-0 truncate text-[13px] font-medium text-[#334155]">{r.label}</span>
            <span className="h-[6px] flex-1 rounded-full bg-[#eef1f6]">
              <span className="block h-full rounded-full" style={{ width: `${(r.value / maxVal) * 100}%`, backgroundColor: r.color }} />
            </span>
            <span className="w-[56px] shrink-0 text-right text-[12px] text-[#64748b]">{r.count}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function BuyingCommitteePage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [company, setCompany] = useState<CompanyOut | null>(null);
  const [score, setScore] = useState<LeadScoreOut | NotScoredOut | null>(null);
  const companyId = getCompanyIdFromUrl();

  useEffect(() => {
    const organisationId = getOrganisationId();
    if (!organisationId || !companyId) {
      return;
    }
    listDecisionMakers(organisationId, companyId).then((res) => setMembers(res.map(toMember))).catch(() => setMembers([]));
    getCompany(organisationId, companyId).then(setCompany).catch(() => setCompany(null));
    getScore(organisationId, companyId).then(setScore).catch(() => setScore(null));
  }, [companyId]);

  const companyName = company?.company_name ?? "this company";

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
          <Header company={company} companyId={companyId} members={members} score={score} />

          <div className="mt-[22px] grid grid-cols-1 gap-[20px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <MembersTable members={members} />
            <div className="flex flex-col gap-[20px]">
              <CommitteeInsights companyName={companyName} members={members} />
              <SeniorityDistribution members={members} />
              <RoleDistribution members={members} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
