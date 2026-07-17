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
import { listDecisionMakers } from "../../api/companies";
import type { DecisionMakerOut } from "../../api/icp";
import { getOrganisationId } from "../../lib/session";

function getCompanyIdFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("id");
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

const scoreCards = [
  { label: "Account Score", value: "92", badge: "Very High", tone: "green", spark: "#7c3aed", values: [40, 46, 44, 52, 48, 58, 62] },
  { label: "Engagement Score", value: "78", badge: "High", tone: "blue", spark: "#2563eb", values: [34, 38, 36, 44, 42, 50, 54] },
  { label: "Fit Score", value: "88", badge: "Excellent", tone: "purple", spark: "#7c3aed", values: [42, 46, 50, 48, 56, 54, 60] },
];

function Header() {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-[12px]">
        <div>
          <nav className="flex flex-wrap items-center gap-[8px] text-[13px] text-[#64748b]">
            <a className="no-underline hover:text-[#334155]" href="/enterprise-list">Enterprise List</a>
            <ChevronRight className="size-[14px] text-[#cbd5e1]" />
            <a className="no-underline hover:text-[#334155]" href="/enterprise-detail">TechNova Solutions</a>
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
          <span className="flex size-[58px] shrink-0 items-center justify-center rounded-[14px] bg-[#16a34a] text-[18px] font-bold text-white">TN</span>
          <div>
            <div className="flex flex-wrap items-center gap-[10px]">
              <h2 className="m-0 text-[20px] font-bold text-[#0f172a]">TechNova Solutions</h2>
              <Badge label="Very High Intent" tone="green" />
              <Star className="size-[15px] text-[#cbd5e1]" />
            </div>
            <p className="m-0 mt-[5px] flex flex-wrap items-center gap-[8px] text-[13px] text-[#64748b]">
              <span>Software Development</span><span>•</span>
              <span>Bengaluru, India</span><span>•</span>
              <a className="font-medium text-[#2563eb] no-underline" href="https://www.technova.com">www.technova.com</a>
              <Linkedin className="size-[15px] text-[#0a66c2]" />
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-[#eef1f6] bg-[#eef1f6] md:grid-cols-4">
          {scoreCards.map((s) => (
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
};

const dummyMembers: Member[] = [
  { initials: "RM", bg: "#6366f1", name: "Rohit Menon", role: "CTO", dept: "Technology", deptSub: "IT Leadership", seniority: "C-Level", senTone: "purple", influence: "High", infTone: "green", time: "2h ago", activity: "Email opened", rel: "Strong", relTone: "green", relIcon: Linkedin, champion: true },
  { initials: "AI", bg: "#ec4899", name: "Ananya Iyer", role: "Head of Engineering", dept: "Engineering", deptSub: "Engineering Leadership", seniority: "Director", senTone: "blue", influence: "High", infTone: "green", time: "5h ago", activity: "Visited pricing page", rel: "Strong", relTone: "green", relIcon: Linkedin, champion: true },
  { initials: "VS", bg: "#0d9488", name: "Vikram Shah", role: "VP of Product", dept: "Product", deptSub: "Product Leadership", seniority: "VP", senTone: "violet", influence: "High", infTone: "green", time: "1d ago", activity: "Attended webinar", rel: "Moderate", relTone: "orange", relIcon: Linkedin, champion: false },
  { initials: "NK", bg: "#f59e0b", name: "Neha Kapoor", role: "Finance Director", dept: "Finance", deptSub: "Finance Leadership", seniority: "Director", senTone: "blue", influence: "Medium", infTone: "orange", time: "2d ago", activity: "Downloaded case study", rel: "Moderate", relTone: "orange", relIcon: Linkedin, champion: false },
  { initials: "SR", bg: "#2563eb", name: "Sandeep Reddy", role: "Head of IT Operations", dept: "IT Operations", deptSub: "Operations Leadership", seniority: "Director", senTone: "blue", influence: "Medium", infTone: "orange", time: "3d ago", activity: "Email opened", rel: "Weak", relTone: "red", relIcon: Linkedin, champion: false },
  { initials: "PN", bg: "#ef4444", name: "Priya Nair", role: "Procurement Manager", dept: "Procurement", deptSub: "Procurement", seniority: "Manager", senTone: "green", influence: "Low", infTone: "blue", time: "4d ago", activity: "Website visit", rel: "Weak", relTone: "red", relIcon: Mail, champion: false },
  { initials: "AD", bg: "#8b5cf6", name: "Arjun Dev", role: "Data & Analytics Lead", dept: "Data & Analytics", deptSub: "Data Leadership", seniority: "Manager", senTone: "green", influence: "Low", infTone: "blue", time: "5d ago", activity: "Blog viewed", rel: "Weak", relTone: "red", relIcon: Linkedin, champion: false },
  { initials: "MJ", bg: "#0ea5e9", name: "Meera Joshi", role: "Legal Counsel", dept: "Legal", deptSub: "Legal", seniority: "Manager", senTone: "green", influence: "Low", infTone: "blue", time: "7d ago", activity: "No activity", rel: "No Connection", relTone: "gray", relIcon: Mail, champion: false },
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
        <span className="text-[13px] text-[#64748b]">Showing 1 - 8 of 8 members</span>
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

function CommitteeInsights() {
  const bullets = [
    "Rohit Menon (CTO) is the key decision maker and highly engaged.",
    "Strong champions identified in Technology and Engineering.",
    "Finance and Procurement need more engagement.",
    "Consider multi-threaded approach to improve coverage.",
  ];
  return (
    <section className="rounded-[16px] border border-[#eee9ff] bg-[#faf8ff] p-[20px]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 flex items-center gap-[8px] text-[15px] font-bold text-[#0f172a]">
          <Sparkles className="size-[17px] text-[#7c3aed]" /> Committee Insights
        </h2>
        <span className="rounded-[6px] bg-[#ede9fe] px-[7px] py-[2px] text-[11px] font-semibold text-[#7c3aed]">AI Generated</span>
      </div>
      <div className="mt-[14px] flex flex-col gap-[12px]">
        {bullets.map((b) => (
          <div className="flex gap-[10px]" key={b}>
            <CheckCircle2 className="mt-[1px] size-[16px] shrink-0 text-[#16a34a]" />
            <p className="m-0 text-[13px] leading-[19px] text-[#475569]">{b}</p>
          </div>
        ))}
      </div>
      <button className="mt-[16px] flex items-center gap-[6px] text-[13px] font-semibold text-[#5b3df5]" type="button">
        View full insights <ChevronRight className="size-[14px]" />
      </button>
    </section>
  );
}

const influence = [
  { label: "High (3)", pct: "38%", value: 3, color: "#6366f1" },
  { label: "Medium (2)", pct: "25%", value: 2, color: "#f97316" },
  { label: "Low (3)", pct: "37%", value: 3, color: "#ec4899" },
];

function InfluenceDistribution() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">Influence Distribution</h2>
        <button className="text-[12px] font-semibold text-[#5b3df5]" type="button">View Details</button>
      </div>
      <div className="mt-[14px] flex items-center gap-[18px]">
        <div className="relative size-[104px] shrink-0">
          <Donut segments={influence.map((i) => ({ value: i.value, color: i.color }))} size={104} thickness={16} />
        </div>
        <div className="flex flex-1 flex-col gap-[12px]">
          {influence.map((i) => (
            <div className="flex items-center justify-between gap-[10px]" key={i.label}>
              <span className="flex items-center gap-[8px] text-[13px] font-medium text-[#334155]">
                <span className="size-[9px] rounded-full" style={{ backgroundColor: i.color }} /> {i.label}
              </span>
              <span className="text-[13px] font-semibold text-[#0f172a]">{i.pct}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const roles = [
  { label: "Technology", count: "2 (25%)", value: 2, color: "#7c3aed" },
  { label: "Engineering", count: "2 (25%)", value: 2, color: "#2563eb" },
  { label: "Product", count: "1 (12%)", value: 1, color: "#0d9488" },
  { label: "Finance", count: "1 (12%)", value: 1, color: "#f59e0b" },
  { label: "Operations", count: "1 (12%)", value: 1, color: "#ec4899" },
  { label: "Procurement", count: "1 (12%)", value: 1, color: "#ef4444" },
  { label: "Legal", count: "0 (0%)", value: 0, color: "#cbd5e1" },
];

function RoleDistribution() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">Role Distribution</h2>
        <button className="text-[12px] font-semibold text-[#5b3df5]" type="button">View Details</button>
      </div>
      <div className="mt-[14px] flex flex-col gap-[12px]">
        {roles.map((r) => (
          <div className="flex items-center gap-[12px]" key={r.label}>
            <span className="w-[96px] shrink-0 text-[13px] font-medium text-[#334155]">{r.label}</span>
            <span className="h-[6px] flex-1 rounded-full bg-[#eef1f6]">
              <span className="block h-full rounded-full" style={{ width: `${(r.value / 2) * 100}%`, backgroundColor: r.color }} />
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

  useEffect(() => {
    const organisationId = getOrganisationId();
    const companyId = getCompanyIdFromUrl();
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
  }, []);

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Enterprise List" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar searchPlaceholder="Search companies, triggers, executives..." showDetection={false} />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          <Header />
          <Tabs />

          <div className="mt-[22px] grid grid-cols-1 gap-[20px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <MembersTable members={members} />
            <div className="flex flex-col gap-[20px]">
              <CommitteeInsights />
              <InfluenceDistribution />
              <RoleDistribution />
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
