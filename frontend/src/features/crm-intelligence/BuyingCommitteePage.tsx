import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Linkedin,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Star,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Donut, Sparkline } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";
import { getCompany, listDecisionMakers } from "../../api/companies";
import type { CompanyOut, DecisionMakerOut } from "../../api/icp";
import { getScore, type LeadScoreOut, type NotScoredOut } from "../../api/scores";
import { getOrganisationId } from "../../lib/session";

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

/* DecisionMaker (backend) has no seniority/influence/last-activity/
 * relationship-strength/champion fields - those are CRM-engagement
 * concepts the model doesn't track (see onboarding audit). Real
 * identity/role fields come from the API; the rest is a fixed,
 * non-committal default rather than invented per-person data. */
function toMember(dm: DecisionMakerOut): Member {
  const name = [dm.first_name, dm.last_name].filter(Boolean).join(" ") || "Unknown";
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const persona = dm.persona ?? "";
  const seniority = /chief|ceo|cfo|cto|coo|cio|ciso|founder|president/.test(persona)
    ? "C-Level"
    : /vp_|evp|svp/.test(persona)
      ? "VP"
      : /director|managing_director/.test(persona)
        ? "Director"
        : "Manager";
  const senTone = seniority === "C-Level" ? "purple" : seniority === "VP" ? "violet" : seniority === "Director" ? "blue" : "green";

  return {
    decisionMakerId: dm.decision_maker_id,
    initials: initials || "?",
    bg: MEMBER_COLORS[hashString(name) % MEMBER_COLORS.length],
    name,
    role: dm.job_title ?? "—",
    dept: dm.department ?? "—",
    deptSub: "—",
    seniority,
    senTone,
    influence: "Medium",
    infTone: "orange",
    time: "—",
    activity: "No recent activity",
    rel: "Unknown",
    relTone: "gray",
    relIcon: dm.email ? Mail : Linkedin,
    champion: false,
    hasEmail: Boolean(dm.email),
  };
}

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

type IconType = ComponentType<{ className?: string }>;

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

const relClass: Record<string, string> = {
  green: "text-[#16a34a]",
  orange: "text-[#f97316]",
  red: "text-[#ef4444]",
  gray: "text-[#94a3b8]",
};

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

/* Engagement Score/Fit Score/Opportunity have no backend model (no
 * engagement tracking, no fit-scoring, no conversion-probability concept
 * beyond the real lead_score/gate model) - kept as clearly-generic
 * placeholders. Account Score is real: it's just the company's actual
 * lead_score, same number shown on Score Breakdown/Enterprise List. */
const dummyScoreCards = [
  { label: "Engagement Score", value: "78", badge: "High", tone: "blue", spark: "#2563eb", values: [34, 38, 36, 44, 42, 50, 54] },
  { label: "Fit Score", value: "88", badge: "Excellent", tone: "purple", spark: "#7c3aed", values: [42, 46, 50, 48, 56, 54, 60] },
];

function accountScoreBadge(score: number): { label: string; tone: string } {
  if (score >= 80) return { label: "Very High", tone: "green" };
  if (score >= 60) return { label: "High", tone: "blue" };
  if (score >= 40) return { label: "Medium", tone: "orange" };
  return { label: "Low", tone: "gray" };
}

function Header({
  company,
  score,
  companyId,
}: {
  company: CompanyOut | null;
  score: LeadScoreOut | NotScoredOut | null;
  companyId: string | null;
}) {
  const name = company?.company_name ?? "TechNova Solutions";
  const initials = company
    ? name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "TN";
  const industry = company?.industries?.[0] ?? "Software Development";
  const location = company ? [company.city, company.country].filter(Boolean).join(", ") || "—" : "Bengaluru, India";
  const website = company?.company_domain ?? "www.technova.com";
  const detailHref = companyId ? `/enterprise-detail?id=${companyId}` : "/enterprise-detail";

  const accountScore = isScored(score) && score.lead_score !== null ? Math.round(score.lead_score) : 92;
  const accountBadge = accountScoreBadge(accountScore);
  const gateStatus = isScored(score) ? score.gate_status : "active";
  const intentBadge = gateStatus === "active" ? { label: "Active Intent", tone: "green" } : { label: "Nurture", tone: "orange" };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-[12px]">
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
            Identify key stakeholders, understand influence and engagement across the buying committee.
          </p>
        </div>
        <div className="flex flex-col items-end gap-[10px]">
          <div className="flex flex-wrap items-center gap-[10px]">
            <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[9px] text-[13px] font-semibold text-[#334155]" type="button">
              <Download className="size-[15px]" /> Export
            </button>
            <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[9px] text-[13px] font-semibold text-[#334155]" type="button">
              <Share2 className="size-[15px]" /> Share
            </button>
            <button className="flex items-center gap-[8px] rounded-[10px] bg-[#fa5a1e] px-[16px] py-[9px] text-[13px] font-semibold text-white shadow-[0px_10px_20px_-6px_rgba(250,90,30,0.5)]" type="button">
              <Send className="size-[15px]" /> Create Outreach
            </button>
          </div>
          <div className="flex items-center gap-[14px] text-[12px] text-[#94a3b8]">
            <span>Last updated: 2h ago</span>
            <button className="flex items-center gap-[5px] font-semibold text-[#5b3df5]" type="button">
              Refresh <RefreshCw className="size-[13px]" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-[18px] flex flex-col gap-[16px] 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex items-start gap-[16px]">
          <span className="flex size-[58px] shrink-0 items-center justify-center rounded-[14px] bg-[#16a34a] text-[18px] font-bold text-white">{initials}</span>
          <div>
            <div className="flex flex-wrap items-center gap-[10px]">
              <h2 className="m-0 text-[20px] font-bold text-[#0f172a]">{name}</h2>
              <Badge label={intentBadge.label} tone={intentBadge.tone} />
              <Star className="size-[15px] text-[#cbd5e1]" />
            </div>
            <p className="m-0 mt-[5px] flex flex-wrap items-center gap-[8px] text-[13px] text-[#64748b]">
              <span>{industry}</span><span>•</span>
              <span>{location}</span><span>•</span>
              <a className="font-medium text-[#2563eb] no-underline" href={`https://${website}`}>{website}</a>
              <Linkedin className="size-[15px] text-[#0a66c2]" />
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-[#eef1f6] bg-[#eef1f6] md:grid-cols-4">
          <div className="bg-white p-[14px]">
            <p className="m-0 text-[12px] text-[#94a3b8]">Account Score</p>
            <div className="mt-[6px] flex items-center gap-[8px]">
              <span className="text-[20px] font-bold leading-none text-[#0f172a]">{accountScore}</span>
              <Badge label={accountBadge.label} tone={accountBadge.tone} />
            </div>
            <div className="mt-[6px]">
              <Sparkline className="h-[26px] w-full" color="#7c3aed" gradientId="bc-AccountScore" values={[accountScore, accountScore]} />
            </div>
          </div>
          {dummyScoreCards.map((s) => (
            <div className="bg-white p-[14px]" key={s.label}>
              <p className="m-0 text-[12px] text-[#94a3b8]">{s.label}</p>
              <div className="mt-[6px] flex items-center gap-[8px]">
                <span className="text-[20px] font-bold leading-none text-[#0f172a]">{s.value}</span>
                <Badge label={s.badge} tone={s.tone} />
              </div>
              <div className="mt-[6px]">
                <Sparkline className="h-[26px] w-full" color={s.spark} gradientId={`bc-${s.label.replace(/\s+/g, "")}`} values={s.values} />
              </div>
            </div>
          ))}
          <div className="bg-white p-[14px]">
            <p className="m-0 text-[12px] text-[#94a3b8]">Opportunity</p>
            <div className="mt-[6px] flex items-center justify-between gap-[8px]">
              <div>
                <p className="m-0 text-[20px] font-bold leading-none text-[#0f172a]">High</p>
                <p className="m-0 mt-[6px] text-[11px] text-[#94a3b8]">78% Probability</p>
              </div>
              <div className="relative size-[50px] shrink-0">
                <Donut gap={0} segments={[{ value: 78, color: "#2563eb" }, { value: 22, color: "#e5e7eb" }]} size={50} thickness={8} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const tabs = ["Committee Overview", "Key Stakeholders", "Influence Map", "Engagement", "Coverage", "Activities", "Insights"];

function Tabs() {
  return (
    <div className="mt-[18px] flex gap-[26px] overflow-x-auto border-b border-[#e9edf5]">
      {tabs.map((tab, i) => (
        <button
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 pb-[14px] text-[14px] font-semibold transition",
            i === 0 ? "border-[#5b3df5] text-[#5b3df5]" : "border-transparent text-[#64748b] hover:text-[#334155]",
          )}
          key={tab}
          type="button"
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Members table                                                       */
/* ------------------------------------------------------------------ */

type Member = {
  decisionMakerId?: string;
  initials: string;
  bg: string;
  name: string;
  role: string;
  dept: string;
  deptSub: string;
  seniority: string;
  senTone: string;
  influence: string;
  infTone: string;
  time: string;
  activity: string;
  rel: string;
  relTone: string;
  relIcon: IconType;
  champion: boolean;
  hasEmail: boolean;
};

const dummyMembers: Member[] = [
  { initials: "RM", bg: "#6366f1", name: "Rohit Menon", role: "CTO", dept: "Technology", deptSub: "IT Leadership", seniority: "C-Level", senTone: "purple", influence: "High", infTone: "green", time: "2h ago", activity: "Email opened", rel: "Strong", relTone: "green", relIcon: Linkedin, champion: true, hasEmail: false },
  { initials: "AI", bg: "#ec4899", name: "Ananya Iyer", role: "Head of Engineering", dept: "Engineering", deptSub: "Engineering Leadership", seniority: "Director", senTone: "blue", influence: "High", infTone: "green", time: "5h ago", activity: "Visited pricing page", rel: "Strong", relTone: "green", relIcon: Linkedin, champion: true, hasEmail: false },
  { initials: "VS", bg: "#0d9488", name: "Vikram Shah", role: "VP of Product", dept: "Product", deptSub: "Product Leadership", seniority: "VP", senTone: "violet", influence: "High", infTone: "green", time: "1d ago", activity: "Attended webinar", rel: "Moderate", relTone: "orange", relIcon: Linkedin, champion: false, hasEmail: false },
  { initials: "NK", bg: "#f59e0b", name: "Neha Kapoor", role: "Finance Director", dept: "Finance", deptSub: "Finance Leadership", seniority: "Director", senTone: "blue", influence: "Medium", infTone: "orange", time: "2d ago", activity: "Downloaded case study", rel: "Moderate", relTone: "orange", relIcon: Linkedin, champion: false, hasEmail: false },
  { initials: "SR", bg: "#2563eb", name: "Sandeep Reddy", role: "Head of IT Operations", dept: "IT Operations", deptSub: "Operations Leadership", seniority: "Director", senTone: "blue", influence: "Medium", infTone: "orange", time: "3d ago", activity: "Email opened", rel: "Weak", relTone: "red", relIcon: Linkedin, champion: false, hasEmail: false },
  { initials: "PN", bg: "#ef4444", name: "Priya Nair", role: "Procurement Manager", dept: "Procurement", deptSub: "Procurement", seniority: "Manager", senTone: "green", influence: "Low", infTone: "blue", time: "4d ago", activity: "Website visit", rel: "Weak", relTone: "red", relIcon: Mail, champion: false, hasEmail: true },
  { initials: "AD", bg: "#8b5cf6", name: "Arjun Dev", role: "Data & Analytics Lead", dept: "Data & Analytics", deptSub: "Data Leadership", seniority: "Manager", senTone: "green", influence: "Low", infTone: "blue", time: "5d ago", activity: "Blog viewed", rel: "Weak", relTone: "red", relIcon: Linkedin, champion: false, hasEmail: false },
  { initials: "MJ", bg: "#0ea5e9", name: "Meera Joshi", role: "Legal Counsel", dept: "Legal", deptSub: "Legal", seniority: "Manager", senTone: "green", influence: "Low", infTone: "blue", time: "7d ago", activity: "No activity", rel: "No Connection", relTone: "gray", relIcon: Mail, champion: false, hasEmail: true },
];

const cols =
  "grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_0.85fr_0.7fr_minmax(0,1.2fr)_1fr_0.6fr_0.5fr]";

function MembersTable({ members }: { members: Member[] }) {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <div className={cn("grid items-center gap-[12px] border-b border-[#eef1f6] pb-[12px] text-[12px] font-semibold text-[#94a3b8]", cols)}>
            <span>Member</span>
            <span>Role &amp; Department</span>
            <span>Seniority</span>
            <span>Influence</span>
            <span>Last Activity</span>
            <span>Relationship</span>
            <span className="text-center">Champion</span>
            <span className="text-right">Actions</span>
          </div>

          <div className="divide-y divide-[#f1f5f9]">
            {members.map((m) => {
              const RelIcon = m.relIcon;
              return (
                <div
                  className={cn("grid cursor-pointer items-center gap-[12px] rounded-[8px] px-[6px] py-[13px] transition hover:bg-[#fafbff]", cols)}
                  key={m.decisionMakerId ?? m.name}
                  onClick={() => {
                    window.location.href = m.decisionMakerId
                      ? `/member-detail?id=${m.decisionMakerId}`
                      : "/member-detail";
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
                      <p className="m-0 text-[12px] text-[#94a3b8]">{m.role}</p>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="m-0 truncate text-[13px] font-medium text-[#334155]">{m.dept}</p>
                    <p className="m-0 text-[12px] text-[#94a3b8]">{m.deptSub}</p>
                  </div>

                  <span><Badge label={m.seniority} tone={m.senTone} /></span>
                  <span><Badge label={m.influence} tone={m.infTone} /></span>

                  <div className="min-w-0">
                    <p className="m-0 text-[13px] font-medium text-[#334155]">{m.time}</p>
                    <p className="m-0 truncate text-[12px] text-[#94a3b8]">{m.activity}</p>
                  </div>

                  <span className={cn("flex items-center gap-[7px] text-[13px] font-semibold", relClass[m.relTone])}>
                    <RelIcon className="size-[15px]" />
                    {m.rel}
                  </span>

                  <span className="flex justify-center">
                    <Star className={cn("size-[17px]", m.champion ? "fill-[#7c3aed] text-[#7c3aed]" : "text-[#cbd5e1]")} />
                  </span>

                  <button aria-label={`Actions for ${m.name}`} className="flex size-[30px] items-center justify-center justify-self-end rounded-[8px] border border-[#e9edf5] text-[#94a3b8] transition hover:bg-[#f6f7fb]" onClick={(event) => event.stopPropagation()} type="button">
                    <MoreHorizontal className="size-[16px]" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-[16px] flex flex-wrap items-center justify-between gap-[12px]">
        <span className="text-[13px] text-[#64748b]">Showing 1 - {members.length} of {members.length} members</span>
        <div className="flex items-center gap-[6px]">
          <button aria-label="Previous page" className="flex size-[32px] items-center justify-center rounded-[9px] border border-[#e9edf5] bg-white text-[#475569]" type="button">
            <ChevronLeft className="size-[15px]" />
          </button>
          <button className="flex size-[32px] items-center justify-center rounded-[9px] bg-[#5b3df5] text-[13px] font-semibold text-white" type="button">1</button>
          <button aria-label="Next page" className="flex size-[32px] items-center justify-center rounded-[9px] border border-[#e9edf5] bg-white text-[#475569]" type="button">
            <ChevronRight className="size-[15px]" />
          </button>
        </div>
        <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[8px] text-[13px] font-semibold text-[#334155]" type="button">
          25 per page <ChevronDown className="size-[14px] text-[#94a3b8]" />
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Right rail                                                          */
/* ------------------------------------------------------------------ */

/* No AI generation happens here - every bullet is computed straight from
 * the real decision-maker rows (seniority derived from persona, department
 * and email presence straight off DecisionMaker), not fabricated per-name
 * prose like "Rohit Menon is highly engaged" that doesn't even exist in
 * the real data for most companies. */
function buildInsights(members: Member[], companyName: string): string[] {
  if (members.length === 0) {
    return [`No decision makers identified yet for ${companyName}.`];
  }

  const bullets = [`${members.length} buying committee member${members.length === 1 ? "" : "s"} identified for ${companyName}.`];

  const cLevel = members.filter((m) => m.seniority === "C-Level");
  if (cLevel.length > 0) {
    bullets.push(`${cLevel.length} C-level contact${cLevel.length === 1 ? "" : "s"} identified: ${cLevel.map((m) => m.name).join(", ")}.`);
  }

  const deptCounts = new Map<string, number>();
  members.forEach((m) => {
    if (m.dept !== "—") deptCounts.set(m.dept, (deptCounts.get(m.dept) ?? 0) + 1);
  });
  const topDept = [...deptCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topDept) {
    bullets.push(`${topDept[0]} has the most identified contacts (${topDept[1]}).`);
  }

  const reachable = members.filter((m) => m.hasEmail).length;
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

/* "Influence" itself is a fixed non-committal default on every real member
 * (toMember() - the backend has no engagement/influence-scoring concept),
 * so charting it would just visualize fake data. Seniority tier IS real
 * (derived from the decision maker's real persona), so this card shows
 * that distribution instead under an honest name. */
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
  members.forEach((m) => counts.set(m.dept === "—" ? "Unspecified" : m.dept, (counts.get(m.dept === "—" ? "Unspecified" : m.dept) ?? 0) + 1));
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

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">Role Distribution</h2>
      <div className="mt-[14px] flex flex-col gap-[12px]">
        {roles.map((r) => (
          <div className="flex items-center gap-[12px]" key={r.label}>
            <span className="w-[96px] shrink-0 text-[13px] font-medium text-[#334155]">{r.label}</span>
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
  const [members, setMembers] = useState<Member[]>(dummyMembers);
  const [company, setCompany] = useState<CompanyOut | null>(null);
  const [score, setScore] = useState<LeadScoreOut | NotScoredOut | null>(null);
  const companyId = getCompanyIdFromUrl();

  useEffect(() => {
    const organisationId = getOrganisationId();
    if (!organisationId || !companyId) {
      return;
    }
    listDecisionMakers(organisationId, companyId)
      .then((res) => {
        if (res.length > 0) {
          setMembers(res.map(toMember));
        }
      })
      .catch(() => {
        // No matching company/decision-makers - keep the dummy rows.
      });
    getCompany(organisationId, companyId)
      .then(setCompany)
      .catch(() => {
        // No matching company - Header falls back to the dummy identity.
      });
    getScore(organisationId, companyId)
      .then(setScore)
      .catch(() => {
        // No score yet - Header's Account Score falls back to the dummy value.
      });
  }, [companyId]);

  const companyName = company?.company_name ?? "TechNova Solutions";

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
          <Tabs />

          <div className="mt-[22px] grid grid-cols-1 gap-[20px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <MembersTable members={members} />
            <div className="flex flex-col gap-[20px]">
              <CommitteeInsights companyName={companyName} members={members} />
              <SeniorityDistribution members={members} />
              <RoleDistribution members={members} />
            </div>
          </div>

          <div className="mt-[20px] flex flex-col gap-[8px] text-[12px] text-[#94a3b8] sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-[6px]">
              <span className="size-[7px] rounded-full bg-[#16a34a]" /> Data refreshed 2 minutes ago
            </span>
            <span>All times shown in IST (India Standard Time)</span>
            <span>Data Source: 42 Integrated Sources</span>
          </div>
        </main>
      </div>
    </div>
  );
}
