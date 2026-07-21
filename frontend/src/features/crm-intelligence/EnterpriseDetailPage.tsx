import {
  ArrowUpRight,
  Banknote,
  Bell,
  Building2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Download,
  Facebook,
  FileText,
  Linkedin,
  Mail,
  MousePointerClick,
  Send,
  Share2,
  Slack,
  Snowflake,
  Star,
  Twitter,
  Users,
  Video,
  Youtube,
} from "lucide-react";
import { useEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Donut, Sparkline, smoothPath } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";
import { getCompany } from "../../api/companies";
import type { CompanyOut } from "../../api/icp";
import { getOrganisationId } from "../../lib/session";

function getCompanyIdFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("id");
}

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

type IconType = ComponentType<{ className?: string; style?: CSSProperties }>;

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

function ViewLink({ label }: { label: string }) {
  return (
    <button className="flex items-center gap-[4px] text-[12px] font-semibold text-[#5b3df5]" type="button">
      {label}
      <ChevronRight className="size-[13px]" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

const scoreCards = [
  { label: "Account Score", value: "92", badge: "Very High", tone: "green", spark: "#7c3aed", values: [40, 46, 44, 52, 48, 58, 62] },
  { label: "Intent Level", value: "Very High", sub: "18% vs last 7 days", tone: "green", spark: "#2563eb", values: [30, 36, 34, 42, 40, 48, 52], arrow: true },
  { label: "Engagement Score", value: "78", badge: "High", tone: "blue", spark: "#2563eb", values: [34, 38, 36, 44, 42, 50, 54] },
  { label: "Fit Score", value: "88", badge: "Excellent", tone: "purple", spark: "#7c3aed", values: [42, 46, 50, 48, 56, 54, 60] },
];

function Header({ company, companyId }: { company: CompanyOut | null; companyId: string | null }) {
  const name = company?.company_name ?? "TechNova Solutions";
  const initials = company
    ? company.company_name
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "TN";
  const industry = company?.industries?.[0] ?? "Software Development";
  const location = company ? [company.city, company.country].filter(Boolean).join(", ") || "—" : "Bengaluru, India";
  const website = company?.company_domain ?? "www.technova.com";

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
        <div className="flex flex-wrap items-center gap-[10px]">
          <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[9px] text-[13px] font-semibold text-[#334155]" type="button">
            <Bell className="size-[15px]" /> Add to Watchlist
          </button>
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
      </div>

      <div className="mt-[16px] flex flex-col gap-[16px] 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="flex items-start gap-[16px]">
          <span className="flex size-[64px] shrink-0 items-center justify-center rounded-[14px] bg-[#16a34a] text-[20px] font-bold text-white">
            {initials}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-[10px]">
              <h1 className="m-0 text-[24px] font-bold text-[#0f172a]">{name}</h1>
              <Badge label="Very High Intent" tone="green" />
              <Star className="size-[16px] text-[#cbd5e1]" />
            </div>
            <p className="m-0 mt-[6px] flex flex-wrap items-center gap-[8px] text-[13px] text-[#64748b]">
              <span>{industry}</span>
              <span>•</span>
              <span>{location}</span>
              <span>•</span>
              <a className="font-medium text-[#2563eb] no-underline" href={`https://${website}`}>
                {website}
              </a>
              <Linkedin className="size-[15px] text-[#0a66c2]" />
            </p>
            <button className="mt-[12px] flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[9px] text-[13px] font-semibold text-[#334155]" type="button">
              <Star className="size-[15px]" /> Add to Watchlist
            </button>
          </div>
        </div>

        <div className="w-full 2xl:w-auto">
          <div className="mb-[8px] flex items-center justify-end gap-[16px] text-[12px] text-[#94a3b8]">
            <span>Last updated: 2h ago</span>
            <button className="flex items-center gap-[4px] font-semibold text-[#5b3df5]" type="button">
              View all signals <ChevronRight className="size-[13px]" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-[#eef1f6] bg-[#eef1f6] md:grid-cols-3 xl:grid-cols-5">
            {scoreCards.map((s) => {
              const isAccountScore = s.label === "Account Score";
              return (
                <div
                  className={cn("bg-white p-[16px]", isAccountScore && "cursor-pointer hover:bg-[#fafbff]")}
                  key={s.label}
                  onClick={
                    isAccountScore
                      ? () => {
                          window.location.href = companyId ? `/score-breakdown?id=${companyId}` : "/score-breakdown";
                        }
                      : undefined
                  }
                  role={isAccountScore ? "button" : undefined}
                  tabIndex={isAccountScore ? 0 : undefined}
                >
                  <p className="m-0 text-[12px] text-[#94a3b8]">{s.label}</p>
                  <div className="mt-[6px] flex items-center gap-[8px]">
                    {s.arrow && <ArrowUpRight className="size-[16px] text-[#16a34a]" />}
                    <span className="text-[20px] font-bold leading-none text-[#0f172a]">{s.value}</span>
                    {s.badge && <Badge label={s.badge} tone={s.tone} />}
                  </div>
                  {s.sub && <p className="m-0 mt-[5px] text-[11px] font-semibold text-[#16a34a]">↑ {s.sub}</p>}
                  <div className="mt-[8px]">
                    <Sparkline className="h-[28px] w-full" color={s.spark} gradientId={`sc-${s.label.replace(/\s+/g, "")}`} values={s.values} />
                  </div>
                </div>
              );
            })}
            <div className="bg-white p-[16px]">
              <p className="m-0 text-[12px] text-[#94a3b8]">Opportunity</p>
              <div className="mt-[6px] flex items-center justify-between gap-[8px]">
                <div>
                  <p className="m-0 text-[20px] font-bold leading-none text-[#0f172a]">High</p>
                  <p className="m-0 mt-[6px] text-[11px] text-[#94a3b8]">78% Probability</p>
                </div>
                <div className="relative size-[52px] shrink-0">
                  <Donut segments={[{ value: 78, color: "#2563eb" }, { value: 22, color: "#e5e7eb" }]} gap={0} size={52} thickness={8} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const tabs = [
  "Overview",
  "Score Breakdown",
  "Signals & Triggers",
  "Buying Committee",
  "Technographics",
  "Firmographics",
  "Financials",
  "News & Insights",
];

const tabLinks: Record<string, string> = {
  "Score Breakdown": "/score-breakdown",
  "Buying Committee": "/buying-committee",
};

function Tabs({ companyId }: { companyId: string | null }) {
  return (
    <div className="mt-[18px] flex gap-[24px] overflow-x-auto border-b border-[#e9edf5]">
      {tabs.map((tab, i) => (
        <button
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 pb-[14px] text-[14px] font-semibold transition",
            i === 0 ? "border-[#5b3df5] text-[#5b3df5]" : "border-transparent text-[#64748b] hover:text-[#334155]",
          )}
          key={tab}
          onClick={() => {
            if (tabLinks[tab]) {
              window.location.href = companyId ? `${tabLinks[tab]}?id=${companyId}` : tabLinks[tab];
            }
          }}
          type="button"
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Row 1 cards                                                         */
/* ------------------------------------------------------------------ */

const dummySnapshot: { label: string; value: ReactNode }[] = [
  { label: "Industry", value: "Software Development" },
  { label: "Company Size", value: "501 - 1,000 employees" },
  { label: "Founded", value: "2012" },
  { label: "Revenue", value: "$75M - $100M" },
  { label: "Headquarters", value: "Bengaluru, India" },
  { label: "Locations", value: "4 Countries" },
  { label: "Website", value: <a className="text-[#2563eb] no-underline" href="https://www.technova.com">www.technova.com</a> },
];

function AccountSnapshot({ company }: { company: CompanyOut | null }) {
  const snapshot: { label: string; value: ReactNode }[] = company
    ? [
        { label: "Industry", value: company.industries?.[0] ?? "—" },
        { label: "Company Size", value: company.employee_range ? `${company.employee_range} employees` : "—" },
        { label: "Founded", value: company.founded_year ?? "—" },
        { label: "Revenue", value: company.revenue_range ?? "—" },
        { label: "Headquarters", value: [company.city, company.country].filter(Boolean).join(", ") || "—" },
        { label: "Locations", value: "—" },
        {
          label: "Website",
          value: company.company_domain ? (
            <a className="text-[#2563eb] no-underline" href={`https://${company.company_domain}`}>
              {company.company_domain}
            </a>
          ) : (
            "—"
          ),
        },
      ]
    : dummySnapshot;

  return (
    <Card title="Account Snapshot">
      <dl className="m-0 flex flex-col gap-[12px]">
        {snapshot.map((r) => (
          <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-[10px]" key={r.label}>
            <dt className="text-[12px] text-[#94a3b8]">{r.label}</dt>
            <dd className="m-0 text-[13px] font-semibold text-[#334155]">{r.value}</dd>
          </div>
        ))}
        <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-[10px]">
          <dt className="text-[12px] text-[#94a3b8]">Social Profiles</dt>
          <dd className="m-0 flex items-center gap-[10px]">
            <Linkedin className="size-[17px] text-[#0a66c2]" />
            <Twitter className="size-[17px] text-[#1da1f2]" />
            <Facebook className="size-[17px] text-[#1877f2]" />
            <Youtube className="size-[17px] text-[#ff0000]" />
          </dd>
        </div>
      </dl>
    </Card>
  );
}

const sotLabels = ["May 14", "May 15", "May 16", "May 17", "May 18", "May 19", "May 20"];
const sotOverall = [62, 68, 72, 70, 74, 88, 84];
const sotBench = [42, 45, 48, 46, 50, 55, 52];

function SignalsOverTimeChart() {
  const w = 420;
  const h = 220;
  const left = 30;
  const right = w - 12;
  const top = 12;
  const bottom = 180;
  const grid = [0, 25, 50, 75, 100];
  const xOf = (i: number) => left + (i * (right - left)) / (sotLabels.length - 1);
  const yOf = (v: number) => bottom - (v / 100) * (bottom - top);
  const p1 = sotOverall.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
  const p2 = sotBench.map((v, i) => ({ x: xOf(i), y: yOf(v) }));

  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h}`}>
      {grid.map((v) => (
        <g key={v}>
          <line stroke="#eef2f7" strokeWidth="1" x1={left} x2={right} y1={yOf(v)} y2={yOf(v)} />
          <text fill="#94a3b8" fontSize="10" textAnchor="end" x={left - 6} y={yOf(v) + 4}>{v}</text>
        </g>
      ))}
      <path d={smoothPath(p2)} fill="none" stroke="#cbd5e1" strokeDasharray="4 4" strokeWidth="2" />
      {p2.map((p, i) => <circle cx={p.x} cy={p.y} fill="#cbd5e1" key={i} r="3" />)}
      <path d={smoothPath(p1)} fill="none" stroke="#7c3aed" strokeWidth="2.5" />
      {p1.map((p, i) => <circle cx={p.x} cy={p.y} fill="#7c3aed" key={i} r="3.4" />)}
      {sotLabels.map((label, i) => (
        <text fill="#94a3b8" fontSize="10" key={label} textAnchor={i === 0 ? "start" : i === sotLabels.length - 1 ? "end" : "middle"} x={xOf(i)} y={bottom + 22}>
          {label}
        </text>
      ))}
    </svg>
  );
}

function SignalsOverTime() {
  return (
    <Card
      action={
        <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[12px] py-[7px] text-[12px] font-semibold text-[#475569]" type="button">
          Last 7 Days <ChevronDown className="size-[13px] text-[#94a3b8]" />
        </button>
      }
      title="Signals Over Time"
    >
      <div className="flex items-center gap-[18px]">
        <span className="flex items-center gap-[7px] text-[12px] font-medium text-[#475569]">
          <span className="size-[9px] rounded-full bg-[#7c3aed]" /> Overall Signal Score
        </span>
        <span className="flex items-center gap-[7px] text-[12px] font-medium text-[#475569]">
          <span className="h-[2px] w-[14px] rounded bg-[#cbd5e1]" /> Industry Benchmark
        </span>
      </div>
      <div className="mt-[8px]">
        <SignalsOverTimeChart />
      </div>
    </Card>
  );
}

const topTriggers = [
  { name: "Cloud Migration", value: 92 },
  { name: "AI/ML Solutions", value: 88 },
  { name: "DevOps Automation", value: 84 },
  { name: "Data Analytics", value: 76 },
  { name: "Cybersecurity", value: 65 },
];

function TopTriggers() {
  return (
    <Card title="Top Triggers">
      <div className="flex flex-col gap-[16px]">
        {topTriggers.map((t) => (
          <div key={t.name}>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#334155]">{t.name}</span>
              <span className="text-[13px] font-bold text-[#0f172a]">{t.value}</span>
            </div>
            <div className="mt-[6px] h-[6px] w-full rounded-full bg-[#eef1f6]">
              <span className="block h-full rounded-full bg-[#7c3aed]" style={{ width: `${t.value}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

const keySignals = [
  { icon: Users, bg: "#e6f0ff", color: "#2563eb", text: "Hiring spike in Engineering dept.", level: "High", tone: "green", time: "2h ago" },
  { icon: Cloud, bg: "#e6f0ff", color: "#2563eb", text: "Technology expansion with AWS", level: "High", tone: "green", time: "5h ago" },
  { icon: MousePointerClick, bg: "#fff1e3", color: "#f97316", text: "Visited pricing page 5+ times", level: "Medium", tone: "orange", time: "8h ago" },
  { icon: Video, bg: "#fff1e3", color: "#f97316", text: "Attended webinar on AI automation", level: "Medium", tone: "orange", time: "12h ago" },
  { icon: Banknote, bg: "#e6f0ff", color: "#2563eb", text: "New funding round announced", level: "Low", tone: "blue", time: "1d ago" },
];

function KeySignals() {
  return (
    <Card title="Key Signals (Last 7 Days)">
      <div className="flex flex-col gap-[14px]">
        {keySignals.map((s) => {
          const Icon = s.icon;
          return (
            <div className="flex items-center gap-[12px]" key={s.text}>
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px]" style={{ backgroundColor: s.bg, color: s.color }}>
                <Icon className="size-[15px]" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#334155]">{s.text}</span>
              <Badge label={s.level} tone={s.tone} />
              <span className="w-[46px] shrink-0 text-right text-[12px] text-[#94a3b8]">{s.time}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Row 2 cards                                                         */
/* ------------------------------------------------------------------ */

const fitRows = [
  { label: "Industry Fit", level: "High", tone: "green" },
  { label: "Solution Fit", level: "High", tone: "green" },
  { label: "Company Size Fit", level: "High", tone: "green" },
  { label: "Technology Fit", level: "Medium", tone: "orange" },
  { label: "Budget Fit", level: "High", tone: "green" },
];

function AccountFit() {
  return (
    <Card action={<ViewLink label="View full analysis" />} title="Account Fit Analysis">
      <div className="flex items-center gap-[20px]">
        <div className="relative size-[110px] shrink-0">
          <Donut segments={[{ value: 92, color: "#2563eb" }, { value: 8, color: "#e5e7eb" }]} gap={0} size={110} thickness={12} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[20px] font-bold leading-none text-[#0f172a]">92%</span>
            <span className="mt-[3px] text-[11px] font-semibold text-[#2563eb]">Strong Fit</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-[10px]">
          {fitRows.map((r) => (
            <div className="flex items-center justify-between gap-[10px]" key={r.label}>
              <span className="flex items-center gap-[8px] text-[13px] font-medium text-[#334155]">
                <span className="size-[7px] rounded-full bg-[#16a34a]" /> {r.label}
              </span>
              <Badge label={r.level} tone={r.tone} />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

const dummyTechStack: { cat: string; icon: IconType; label: string; color: string }[] = [
  { cat: "Cloud", icon: Cloud, label: "aws", color: "#f59e0b" },
  { cat: "Data & Analytics", icon: Snowflake, label: "Snowflake", color: "#29b5e8" },
  { cat: "CRM", icon: Cloud, label: "Salesforce", color: "#00a1e0" },
  { cat: "Marketing", icon: Building2, label: "HubSpot", color: "#ff7a59" },
  { cat: "Collaboration", icon: Slack, label: "Slack", color: "#611f69" },
];

function TechnologyStack({ company }: { company: CompanyOut | null }) {
  // Company.technologies is a flat string list - no per-item category/color
  // metadata exists on the backend, so real entries all share a generic
  // icon/color instead of the dummy data's per-category styling.
  const techStack: { cat: string; icon: IconType; label: string; color: string }[] =
    company && company.technologies && company.technologies.length > 0
      ? company.technologies.slice(0, 10).map((tech) => ({ cat: "Technology", icon: Cloud, label: tech, color: "#5b3df5" }))
      : dummyTechStack;

  return (
    <Card action={<ViewLink label="View all technologies" />} title="Technology Stack">
      <div className="grid grid-cols-2 gap-[16px] sm:grid-cols-3 lg:grid-cols-5">
        {techStack.map((t) => {
          const Icon = t.icon;
          return (
            <div className="flex flex-col items-center gap-[8px] text-center" key={`${t.cat}-${t.label}`}>
              <p className="m-0 text-[11px] font-medium text-[#94a3b8]">{t.cat}</p>
              <div className="flex h-[52px] w-full items-center justify-center gap-[6px] rounded-[10px] border border-[#eef1f6] bg-[#fafbfc]">
                <Icon className="size-[18px]" style={{ color: t.color }} />
                <span className="text-[12px] font-semibold text-[#334155]">{t.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const people = [
  { initials: "RM", name: "Rohit Menon", role: "CTO", strength: "Strong", color: "#16a34a", x: "60%", y: "16%" },
  { initials: "VS", name: "Vikram Shah", role: "VP of Product", strength: "Strong", color: "#16a34a", x: "84%", y: "50%" },
  { initials: "AI", name: "Ananya Iyer", role: "Head of Engineering", strength: "Moderate", color: "#f97316", x: "16%", y: "50%" },
  { initials: "NK", name: "Neha Kapoor", role: "Finance Director", strength: "Weak", color: "#ef4444", x: "49%", y: "84%" },
];
const nodePts = [
  [240, 45],
  [336, 140],
  [64, 140],
  [196, 236],
];

function RelationshipMap() {
  return (
    <Card action={<ViewLink label="View Full Graph" />} title="Relationship Map">
      <div className="relative h-[260px] w-full">
        <svg className="absolute inset-0 size-full" preserveAspectRatio="none" viewBox="0 0 400 280">
          {nodePts.map((p, i) => (
            <line key={i} stroke="#dbe0ea" strokeDasharray="4 4" strokeWidth="1.5" x1="200" x2={p[0]} y1="140" y2={p[1]} />
          ))}
        </svg>
        <div className="absolute left-1/2 top-1/2 flex size-[54px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[14px] border border-[#e6e2ff] bg-white shadow-[0px_6px_16px_rgba(91,61,245,0.12)]">
          <Building2 className="size-[24px] text-[#5b3df5]" />
        </div>
        {people.map((p) => (
          <div className="absolute -translate-x-1/2 -translate-y-1/2 text-center" key={p.name} style={{ left: p.x, top: p.y }}>
            <span className="mx-auto flex size-[44px] items-center justify-center rounded-full border-2 bg-white text-[12px] font-bold text-[#334155]" style={{ borderColor: p.color }}>
              {p.initials}
            </span>
            <p className="m-0 mt-[4px] whitespace-nowrap text-[11px] font-bold text-[#0f172a]">{p.name}</p>
            <p className="m-0 whitespace-nowrap text-[10px] text-[#94a3b8]">{p.role}</p>
            <span className="mt-[2px] inline-flex items-center gap-[4px] text-[10px] font-semibold" style={{ color: p.color }}>
              <span className="size-[5px] rounded-full" style={{ backgroundColor: p.color }} /> {p.strength}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Row 3 cards                                                         */
/* ------------------------------------------------------------------ */

const news = [
  { grad: "from-[#60a5fa] to-[#a78bfa]", title: "TechNova raises $25M Series B funding to accelerate AI product development", date: "May 19, 2025", source: "Business Wire", sentiment: "Positive", tone: "green" },
  { grad: "from-[#34d399] to-[#22d3ee]", title: "Expanding engineering team in AI and ML to drive next-gen platform capabilities", date: "May 18, 2025", source: "LinkedIn", sentiment: "Positive", tone: "green" },
  { grad: "from-[#fbbf24] to-[#f97316]", title: "New office announced in San Jose, USA to strengthen global presence", date: "May 16, 2025", source: "TechNova Blog", sentiment: "Neutral", tone: "gray" },
  { grad: "from-[#a78bfa] to-[#f472b6]", title: "Q1 revenue up 32% YoY driven by strong demand for cloud solutions", date: "May 15, 2025", source: "Press Release", sentiment: "Positive", tone: "green" },
];

function RecentNews() {
  return (
    <Card action={<ViewLink label="View All" />} title="Recent News & Triggers">
      <div className="flex flex-col gap-[16px]">
        {news.map((n) => (
          <div className="flex items-center gap-[14px]" key={n.title}>
            <span className={cn("h-[46px] w-[66px] shrink-0 rounded-[8px] bg-gradient-to-br", n.grad)} />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[13px] font-semibold leading-[18px] text-[#0f172a]">{n.title}</p>
              <p className="m-0 mt-[4px] text-[12px] text-[#94a3b8]">
                {n.date} • {n.source}
              </p>
            </div>
            <Badge label={n.sentiment} tone={n.tone} />
          </div>
        ))}
      </div>
    </Card>
  );
}

const timeline = [
  { icon: MousePointerClick, text: "Visited pricing page", time: "2 hours ago" },
  { icon: Mail, text: "Opened email: Solution Overview", time: "5 hours ago" },
  { icon: FileText, text: "Downloaded case study", time: "1 day ago" },
  { icon: Video, text: "Attended webinar: AI for DevOps", time: "2 days ago" },
  { icon: Users, text: "Visited careers page", time: "3 days ago" },
  { icon: Linkedin, text: "Connected on LinkedIn", time: "5 days ago" },
];

function EngagementTimeline() {
  return (
    <Card action={<ViewLink label="View All" />} title="Engagement Timeline">
      <div className="flex flex-col gap-[16px]">
        {timeline.map((t) => {
          const Icon = t.icon;
          return (
            <div className="flex items-center gap-[12px]" key={t.text}>
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px] bg-[#eef1ff] text-[#5b3df5]">
                <Icon className="size-[15px]" />
              </span>
              <span className="flex-1 text-[13px] font-medium text-[#334155]">{t.text}</span>
              <span className="text-[12px] text-[#94a3b8]">{t.time}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function EnterpriseDetailPage() {
  const [company, setCompany] = useState<CompanyOut | null>(null);
  const companyId = getCompanyIdFromUrl();

  useEffect(() => {
    const organisationId = getOrganisationId();
    if (!organisationId || !companyId) {
      return;
    }
    getCompany(organisationId, companyId)
      .then(setCompany)
      .catch(() => {
        // No matching company - keep the dummy fallback data.
      });
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
          <Header company={company} companyId={companyId} />
          <Tabs companyId={companyId} />

          <div className="mt-[22px] grid grid-cols-1 gap-[20px] lg:grid-cols-2 xl:grid-cols-[1fr_1.2fr_1fr_1.3fr]">
            <AccountSnapshot company={company} />
            <SignalsOverTime />
            <TopTriggers />
            <KeySignals />
          </div>

          <div className="mt-[20px] grid grid-cols-1 gap-[20px] xl:grid-cols-[1fr_1fr_1.3fr]">
            <AccountFit />
            <TechnologyStack company={company} />
            <RelationshipMap />
          </div>

          <div className="mt-[20px] grid grid-cols-1 gap-[20px] lg:grid-cols-2">
            <RecentNews />
            <EngagementTimeline />
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
