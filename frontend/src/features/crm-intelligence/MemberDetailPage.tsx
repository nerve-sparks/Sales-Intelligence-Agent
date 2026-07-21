import {
  Banknote,
  Bell,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Linkedin,
  Mail,
  MousePointerClick,
  Phone,
  Send,
  Share2,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Donut, Sparkline, smoothPath } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";
import { getDecisionMaker } from "../../api/companies";
import type { DecisionMakerOut } from "../../api/icp";
import { getOrganisationId } from "../../lib/session";

function getDecisionMakerIdFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("id");
}

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

type IconType = ComponentType<{ className?: string }>;

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
  { label: "Intent Score", value: "92", badge: "Very High", tone: "green", spark: "#7c3aed", values: [40, 46, 44, 52, 48, 58, 62] },
  { label: "Engagement Score", value: "78", badge: "High", tone: "blue", spark: "#2563eb", values: [34, 38, 36, 44, 42, 50, 54] },
  { label: "Fit Score", value: "88", badge: "Excellent", tone: "purple", spark: "#7c3aed", values: [42, 46, 50, 48, 56, 54, 60] },
  { label: "Account Fit", value: "92%", badge: "Strong", tone: "green", spark: "#16a34a", values: [30, 36, 40, 44, 48, 54, 58] },
];

function Header({ dm }: { dm: DecisionMakerOut | null }) {
  const name = dm ? [dm.first_name, dm.last_name].filter(Boolean).join(" ") || "Unknown" : "Rohit Menon";
  const initials = dm
    ? name
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "RM";
  const jobTitle = dm?.job_title ?? "CTO";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-[12px]">
        <nav className="flex flex-wrap items-center gap-[8px] text-[13px] text-[#64748b]">
          <a className="no-underline hover:text-[#334155]" href="/buying-committee">Buying Committee</a>
          <ChevronRight className="size-[14px] text-[#cbd5e1]" />
          <span className="font-semibold text-[#0f172a]">{name}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-[10px]">
          <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[9px] text-[13px] font-semibold text-[#334155]" type="button"><Bell className="size-[15px]" /> Add to Watchlist</button>
          <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[9px] text-[13px] font-semibold text-[#334155]" type="button"><Download className="size-[15px]" /> Export</button>
          <button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[9px] text-[13px] font-semibold text-[#334155]" type="button"><Share2 className="size-[15px]" /> Share</button>
          <button className="flex items-center gap-[8px] rounded-[10px] bg-[#fa5a1e] px-[16px] py-[9px] text-[13px] font-semibold text-white shadow-[0px_10px_20px_-6px_rgba(250,90,30,0.5)]" type="button"><Send className="size-[15px]" /> Create Outreach</button>
        </div>
      </div>

      <div className="mt-[16px] flex flex-col gap-[16px] 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex items-start gap-[16px]">
          <span className="relative shrink-0">
            <span className="flex size-[64px] items-center justify-center rounded-full bg-[#6366f1] text-[20px] font-bold text-white">{initials}</span>
            <span className="absolute bottom-[2px] right-[2px] size-[13px] rounded-full border-2 border-white bg-[#22c55e]" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-[10px]">
              <h1 className="m-0 text-[24px] font-bold text-[#0f172a]">{name}</h1>
              <Badge label="Champion" tone="green" />
              <Star className="size-[16px] text-[#cbd5e1]" />
            </div>
            <p className="m-0 mt-[5px] flex items-center gap-[8px] text-[13px] font-medium text-[#334155]">
              {jobTitle} •
              <button className="flex items-center gap-[4px] font-semibold text-[#2563eb]" type="button">
                TechNova Solutions <ChevronDown className="size-[13px]" />
              </button>
            </p>
            <p className="m-0 mt-[5px] flex flex-wrap items-center gap-[8px] text-[13px] text-[#64748b]">
              <span>Bengaluru, Karnataka, India</span><span>•</span>
              <span>8:45 AM IST</span><span>•</span>
              <span className="flex items-center gap-[4px]">LinkedIn <Linkedin className="size-[14px] text-[#0a66c2]" /></span>
            </p>
            <div className="mt-[10px] flex flex-wrap gap-[8px]">
              <Badge label="Decision Maker" tone="blue" />
              <Badge label="High Intent" tone="purple" />
              <Badge label="Active in Last 2 Days" tone="green" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-[#eef1f6] bg-[#eef1f6] md:grid-cols-3 xl:grid-cols-5">
          {scoreCards.map((s) => (
            <div className="bg-white p-[14px]" key={s.label}>
              <p className="m-0 text-[12px] text-[#94a3b8]">{s.label}</p>
              <div className="mt-[6px] flex items-center gap-[8px]">
                <span className="text-[20px] font-bold leading-none text-[#0f172a]">{s.value}</span>
                <Badge label={s.badge} tone={s.tone} />
              </div>
              <div className="mt-[6px]"><Sparkline className="h-[26px] w-full" color={s.spark} gradientId={`ms-${s.label.replace(/\s+/g, "")}`} values={s.values} /></div>
            </div>
          ))}
          <div className="bg-white p-[14px]">
            <p className="m-0 text-[12px] text-[#94a3b8]">Opportunity</p>
            <div className="mt-[6px] flex items-center justify-between gap-[8px]">
              <div>
                <p className="m-0 text-[20px] font-bold leading-none text-[#0f172a]">High</p>
                <p className="m-0 mt-[6px] text-[11px] text-[#94a3b8]">78% Probability</p>
              </div>
              <div className="relative size-[50px] shrink-0"><Donut gap={0} segments={[{ value: 78, color: "#2563eb" }, { value: 22, color: "#e5e7eb" }]} size={50} thickness={8} /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const tabs = ["Overview", "Signals", "Intent", "Buyers & Committee", "Firmographics", "Technographics", "Engagement", "Activities", "Notes", "Files"];

function Tabs() {
  return (
    <div className="mt-[18px] flex gap-[24px] overflow-x-auto border-b border-[#e9edf5]">
      {tabs.map((tab, i) => (
        <button className={cn("-mb-px whitespace-nowrap border-b-2 pb-[14px] text-[14px] font-semibold transition", i === 0 ? "border-[#5b3df5] text-[#5b3df5]" : "border-transparent text-[#64748b] hover:text-[#334155]")} key={tab} type="button">
          {tab}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Left column cards                                                   */
/* ------------------------------------------------------------------ */

function ContactInformation({ dm }: { dm: DecisionMakerOut | null }) {
  const dummyRows = [
    { icon: Mail, value: "rohit.menon@technova.com", copy: true },
    { icon: Phone, value: "+91 98765 43210", copy: true },
    { icon: Linkedin, value: "linkedin.com/in/rohitmenon", external: true },
  ];
  const realRows: typeof dummyRows = [];
  if (dm?.email) {
    realRows.push({ icon: Mail, value: dm.email, copy: true });
  }
  if (dm?.phone) {
    realRows.push({ icon: Phone, value: dm.phone, copy: true });
  }
  if (dm?.mobile_phone) {
    realRows.push({ icon: Phone, value: dm.mobile_phone, copy: true });
  }
  if (dm?.linkedin_url) {
    realRows.push({ icon: Linkedin, value: dm.linkedin_url, external: true });
  }
  const rows = dm ? realRows : dummyRows;
  return (
    <Card title="Contact Information">
      <div className="flex flex-col gap-[14px]">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <div className="flex items-center gap-[12px]" key={r.value}>
              <Icon className="size-[17px] shrink-0 text-[#94a3b8]" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#334155]">{r.value}</span>
              {r.copy && <Copy className="size-[15px] shrink-0 text-[#94a3b8]" />}
              {r.external && <ExternalLink className="size-[15px] shrink-0 text-[#94a3b8]" />}
            </div>
          );
        })}
      </div>
      <button className="mt-[16px] flex items-center gap-[5px] text-[13px] font-semibold text-[#5b3df5]" type="button">View in CRM <ChevronRight className="size-[14px]" /></button>
    </Card>
  );
}

function CurrentRole({ dm }: { dm: DecisionMakerOut | null }) {
  const rows = dm
    ? [
        { label: "Current Role", value: dm.job_title ?? "—" },
        { label: "Department", value: dm.department ?? "—" },
        { label: "Since", value: "—" },
        { label: "Experience", value: dm.years_of_experience ?? "—" },
        { label: "Education", value: "—" },
      ]
    : [
        { label: "Current Role", value: "CTO" },
        { label: "Department", value: "Engineering" },
        { label: "Since", value: "Jan 2022 (2.4 yrs)" },
        { label: "Experience", value: "12+ years" },
        { label: "Education", value: "B.Tech, IIT Madras" },
      ];
  return (
    <Card title="Current Role & Background">
      <dl className="m-0 flex flex-col gap-[12px]">
        {rows.map((r) => (
          <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-[10px]" key={r.label}>
            <dt className="text-[12px] text-[#94a3b8]">{r.label}</dt>
            <dd className="m-0 text-[13px] font-semibold text-[#334155]">{r.value}</dd>
          </div>
        ))}
        <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-[10px]">
          <dt className="text-[12px] text-[#94a3b8]">Previous Roles</dt>
          <dd className="m-0 flex items-center gap-[6px]">
            {["Infosys", "Dell", "IBM"].map((c) => (
              <span className="rounded-[6px] bg-[#f1f5f9] px-[8px] py-[3px] text-[10px] font-bold text-[#64748b]" key={c}>{c}</span>
            ))}
            <span className="text-[11px] font-semibold text-[#94a3b8]">+2</span>
          </dd>
        </div>
      </dl>
    </Card>
  );
}

const recentSignals = [
  { icon: Users, bg: "#e6f0ff", color: "#2563eb", text: "Hiring spike in Engineering department", level: "High", tone: "green", time: "2h ago" },
  { icon: Cloud, bg: "#e6f0ff", color: "#2563eb", text: "Technology expansion with AWS", level: "High", tone: "green", time: "5h ago" },
  { icon: MousePointerClick, bg: "#fff1e3", color: "#f97316", text: "Visited pricing page 5+ times", level: "Medium", tone: "orange", time: "8h ago" },
  { icon: Video, bg: "#fff1e3", color: "#f97316", text: "Attended webinar on AI automation", level: "Medium", tone: "orange", time: "12h ago" },
  { icon: Banknote, bg: "#e6f0ff", color: "#2563eb", text: "New funding round announced", level: "Low", tone: "blue", time: "1d ago" },
];

function RecentSignals() {
  return (
    <Card action={<ViewLink label="View all signals" />} title="Recent Signals">
      <div className="flex flex-col gap-[14px]">
        {recentSignals.map((s) => {
          const Icon = s.icon;
          return (
            <div className="flex items-center gap-[12px]" key={s.text}>
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px]" style={{ backgroundColor: s.bg, color: s.color }}><Icon className="size-[15px]" /></span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#334155]">{s.text}</span>
              <Badge label={s.level} tone={s.tone} />
              <span className="w-[44px] shrink-0 text-right text-[12px] text-[#94a3b8]">{s.time}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

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
      <div className="flex items-center gap-[18px]">
        <div className="relative size-[104px] shrink-0">
          <Donut gap={0} segments={[{ value: 92, color: "#2563eb" }, { value: 8, color: "#e5e7eb" }]} size={104} thickness={12} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[19px] font-bold leading-none text-[#0f172a]">92%</span>
            <span className="mt-[3px] text-[11px] font-semibold text-[#2563eb]">Strong Fit</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-[9px]">
          {fitRows.map((r) => (
            <div className="flex items-center justify-between gap-[10px]" key={r.label}>
              <span className="flex items-center gap-[8px] text-[13px] font-medium text-[#334155]"><span className="size-[7px] rounded-full bg-[#16a34a]" /> {r.label}</span>
              <Badge label={r.level} tone={r.tone} />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

const timeline = [
  { icon: Mail, text: "Opened email: Solution Overview", time: "2h ago" },
  { icon: MousePointerClick, text: "Visited pricing page", time: "5h ago" },
  { icon: FileText, text: "Downloaded case study", time: "1d ago" },
  { icon: Video, text: "Attended webinar: AI for DevOps", time: "2d ago" },
  { icon: Building2, text: "Visited website – 3 pages", time: "3d ago" },
  { icon: Linkedin, text: "Connected on LinkedIn", time: "5d ago" },
];

function EngagementTimeline() {
  return (
    <Card title="Engagement Timeline">
      <div className="flex flex-col gap-[14px]">
        {timeline.map((t) => {
          const Icon = t.icon;
          return (
            <div className="flex items-center gap-[12px]" key={t.text}>
              <span className="w-[46px] shrink-0 text-[12px] text-[#94a3b8]">{t.time}</span>
              <span className="flex size-[28px] shrink-0 items-center justify-center rounded-[8px] bg-[#eef1ff] text-[#5b3df5]"><Icon className="size-[14px]" /></span>
              <span className="flex-1 text-[13px] font-medium text-[#334155]">{t.text}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const intentLabels = ["May 14", "May 15", "May 16", "May 17", "May 18", "May 19", "May 20"];
const intentValues = [55, 62, 70, 66, 74, 90, 82];

function IntentChart() {
  const w = 420;
  const h = 200;
  const left = 30;
  const right = w - 12;
  const top = 12;
  const bottom = 160;
  const grid = [0, 25, 50, 75, 100];
  const xOf = (i: number) => left + (i * (right - left)) / (intentLabels.length - 1);
  const yOf = (v: number) => bottom - (v / 100) * (bottom - top);
  const pts = intentValues.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h}`}>
      {grid.map((v) => (
        <g key={v}>
          <line stroke="#eef2f7" strokeWidth="1" x1={left} x2={right} y1={yOf(v)} y2={yOf(v)} />
          <text fill="#94a3b8" fontSize="10" textAnchor="end" x={left - 6} y={yOf(v) + 4}>{v}</text>
        </g>
      ))}
      <path d={smoothPath(pts)} fill="none" stroke="#7c3aed" strokeWidth="2.5" />
      {pts.map((p, i) => <circle cx={p.x} cy={p.y} fill="#7c3aed" key={i} r="3.2" />)}
      {intentLabels.map((label, i) => (
        <text fill="#94a3b8" fontSize="10" key={label} textAnchor={i === 0 ? "start" : i === intentLabels.length - 1 ? "end" : "middle"} x={xOf(i)} y={bottom + 20}>{label}</text>
      ))}
    </svg>
  );
}

function IntentOverTime() {
  return (
    <Card
      action={<button className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[12px] py-[7px] text-[12px] font-semibold text-[#475569]" type="button">Last 7 Days <ChevronDown className="size-[13px] text-[#94a3b8]" /></button>}
      title="Intent Over Time"
    >
      <IntentChart />
      <div className="mt-[12px] flex items-start gap-[10px] rounded-[10px] bg-[#f5f3ff] p-[12px]">
        <TrendingUp className="mt-[1px] size-[16px] shrink-0 text-[#7c3aed]" />
        <p className="m-0 text-[12px] leading-[17px] text-[#475569]">
          <span className="font-semibold text-[#0f172a]">Intent trending up 18% in the last 7 days.</span> Strong buying signals detected.
        </p>
      </div>
    </Card>
  );
}

const news = [
  { grad: "from-[#60a5fa] to-[#a78bfa]", title: "TechNova raises $25M Series B funding to accelerate AI product development", date: "May 19, 2025", source: "Business Wire", sentiment: "Positive", tone: "green" },
  { grad: "from-[#34d399] to-[#22d3ee]", title: "Expanding engineering team in AI and ML to drive next-gen platform capabilities", date: "May 18, 2025", source: "LinkedIn", sentiment: "Positive", tone: "green" },
  { grad: "from-[#fbbf24] to-[#f97316]", title: "New office announced in San Jose, USA to strengthen global presence", date: "May 16, 2025", source: "TechNova Blog", sentiment: "Neutral", tone: "gray" },
];

function NewsEvents() {
  return (
    <Card action={<ViewLink label="View all" />} title="News & Trigger Events">
      <div className="flex flex-col gap-[14px]">
        {news.map((n) => (
          <div className="flex items-center gap-[12px]" key={n.title}>
            <span className={cn("h-[44px] w-[60px] shrink-0 rounded-[8px] bg-gradient-to-br", n.grad)} />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[13px] font-semibold leading-[18px] text-[#0f172a]">{n.title}</p>
              <p className="m-0 mt-[3px] text-[12px] text-[#94a3b8]">{n.date} • {n.source}</p>
            </div>
            <Badge label={n.sentiment} tone={n.tone} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function AISummary() {
  const bullets = [
    "High engagement with pricing and content",
    "Actively evaluating cloud and automation solutions",
    "Strong influence in buying committee",
    "Good timing with funding and expansion",
  ];
  return (
    <Card action={<span className="rounded-[6px] bg-[#f3e9ff] px-[7px] py-[2px] text-[11px] font-semibold text-[#7c3aed]">AI Generated</span>} title="AI Summary">
      <p className="m-0 text-[13px] leading-[19px] text-[#475569]">
        Rohit is showing very high intent with multiple strong signals in the last 48 hours. His focus on cloud modernization and AI aligns perfectly with our solutions.
      </p>
      <div className="mt-[14px] flex flex-col gap-[10px]">
        {bullets.map((b) => (
          <div className="flex gap-[10px]" key={b}>
            <CheckCircle2 className="mt-[1px] size-[15px] shrink-0 text-[#16a34a]" />
            <p className="m-0 text-[13px] leading-[18px] text-[#475569]">{b}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CrmPipeline() {
  const rows: { label: string; value: ReactNode }[] = [
    { label: "CRM Owner", value: <span className="flex items-center gap-[6px]"><span className="flex size-[18px] items-center justify-center rounded-full bg-[#0f172a] text-[9px] font-bold text-white">AK</span> Arjun Kumar</span> },
    { label: "Pipeline", value: "Enterprise Pipeline" },
    { label: "Stage", value: "Solution Evaluation" },
    { label: "Amount", value: "$150K - $250K" },
    { label: "Close Date", value: "Jul 30, 2025" },
    { label: "Last Synced", value: <span className="flex items-center gap-[6px]">2h ago <span className="flex items-center gap-[4px] text-[#16a34a]"><CheckCircle2 className="size-[13px]" /> Synced</span></span> },
  ];
  return (
    <Card action={<ViewLink label="View in CRM" />} title="CRM & Pipeline">
      <dl className="m-0 flex flex-col gap-[12px]">
        {rows.map((r) => (
          <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-[10px]" key={r.label}>
            <dt className="text-[12px] text-[#94a3b8]">{r.label}</dt>
            <dd className="m-0 text-[13px] font-semibold text-[#334155]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Right rail                                                          */
/* ------------------------------------------------------------------ */

function AboutRohit() {
  const interests = ["Cloud Modernization", "AI/ML", "DevOps", "Automation", "Data Analytics"];
  return (
    <section className="rounded-[16px] border border-[#eee9ff] bg-[#faf8ff] p-[20px]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 flex items-center gap-[8px] text-[15px] font-bold text-[#0f172a]"><Sparkles className="size-[16px] text-[#7c3aed]" /> About Rohit</h2>
        <span className="rounded-[6px] bg-[#ede9fe] px-[7px] py-[2px] text-[11px] font-semibold text-[#7c3aed]">AI Generated</span>
      </div>
      <p className="m-0 mt-[12px] text-[13px] leading-[19px] text-[#475569]">
        Rohit is the CTO of TechNova Solutions, leading technology strategy and product engineering initiatives. He is focused on cloud modernization, AI adoption, and building scalable platform capabilities. Actively evaluating solutions that drive automation, observability, and engineering productivity.
      </p>
      <p className="m-0 mt-[14px] text-[13px] font-bold text-[#0f172a]">Key Interests</p>
      <div className="mt-[8px] flex flex-wrap gap-[6px]">
        {interests.map((i) => (
          <span className="rounded-[6px] bg-white px-[9px] py-[4px] text-[12px] font-medium text-[#4f46e5]" key={i}>{i}</span>
        ))}
      </div>
    </section>
  );
}

const committee = [
  { initials: "AI", bg: "#ec4899", name: "Ananya Iyer", role: "Head of Engineering", badge: "Champion", tone: "green", score: 72, color: "#16a34a" },
  { initials: "VS", bg: "#0d9488", name: "Vikram Shah", role: "VP of Product", badge: "Influencer", tone: "orange", score: 68, color: "#f97316" },
  { initials: "NK", bg: "#f59e0b", name: "Neha Kapoor", role: "Finance Director", badge: "Decision Maker", tone: "blue", score: 60, color: "#2563eb" },
];

function BuyingCommittee() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">Buying Committee</h2>
        <ViewLink label="View all" />
      </div>
      <div className="mt-[14px] flex flex-col gap-[16px]">
        {committee.map((m) => (
          <div className="flex items-start gap-[12px]" key={m.name}>
            <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: m.bg }}>{m.initials}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-[8px]">
                <p className="m-0 truncate text-[13px] font-bold text-[#0f172a]">{m.name}</p>
                <Badge label={m.badge} tone={m.tone} />
              </div>
              <p className="m-0 text-[12px] text-[#94a3b8]">{m.role}</p>
              <div className="mt-[8px] flex items-center justify-between gap-[8px]">
                <span className="flex items-center gap-[8px] text-[#94a3b8]">
                  <Linkedin className="size-[15px] text-[#0a66c2]" />
                  <Mail className="size-[15px]" />
                </span>
                <span className="flex items-center gap-[8px]">
                  <span className="text-[11px] text-[#94a3b8]">Engagement Score</span>
                  <span className="text-[13px] font-bold text-[#0f172a]">{m.score}</span>
                  <span className="h-[5px] w-[40px] rounded-full bg-[#eef1f6]"><span className="block h-full rounded-full" style={{ width: `${m.score}%`, backgroundColor: m.color }} /></span>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const nextActions: { icon: IconType; title: string; sub: string; cta: string }[] = [
  { icon: Mail, title: "Send personalized case study", sub: "Share a case study relevant to their cloud journey.", cta: "Send Now" },
  { icon: Calendar, title: "Invite to executive demo", sub: "Book a demo with our solutions expert.", cta: "Schedule" },
  { icon: Send, title: "Add to nurture campaign", sub: "Add to AI-powered nurture sequence.", cta: "Add Now" },
];

function NextActions() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">Recommended Next Actions</h2>
        <ViewLink label="View all" />
      </div>
      <div className="mt-[14px] flex flex-col gap-[12px]">
        {nextActions.map((a) => {
          const Icon = a.icon;
          return (
            <div className="flex items-center gap-[12px]" key={a.title}>
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[#eef1ff] text-[#5b3df5]"><Icon className="size-[16px]" /></span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[13px] font-semibold text-[#0f172a]">{a.title}</p>
                <p className="m-0 text-[12px] text-[#94a3b8]">{a.sub}</p>
              </div>
              <button className="shrink-0 whitespace-nowrap text-[12px] font-bold text-[#f97316]" type="button">{a.cta}</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function MemberDetailPage() {
  const [dm, setDm] = useState<DecisionMakerOut | null>(null);

  useEffect(() => {
    const organisationId = getOrganisationId();
    const decisionMakerId = getDecisionMakerIdFromUrl();
    if (!organisationId || !decisionMakerId) {
      return;
    }
    getDecisionMaker(organisationId, decisionMakerId)
      .then(setDm)
      .catch(() => {
        // No matching decision-maker - keep the dummy fallback data.
      });
  }, []);

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
          <Tabs />

          <div className="mt-[22px] grid grid-cols-1 gap-[20px] xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-[20px]">
              <div className="grid grid-cols-1 gap-[20px] lg:grid-cols-3">
                <ContactInformation dm={dm} />
                <CurrentRole dm={dm} />
                <RecentSignals />
              </div>
              <div className="grid grid-cols-1 gap-[20px] lg:grid-cols-3">
                <AccountFit />
                <EngagementTimeline />
                <IntentOverTime />
              </div>
              <div className="grid grid-cols-1 gap-[20px] lg:grid-cols-3">
                <NewsEvents />
                <AISummary />
                <CrmPipeline />
              </div>
            </div>

            <div className="flex flex-col gap-[20px]">
              <AboutRohit />
              <BuyingCommittee />
              <NextActions />
            </div>
          </div>

          <div className="mt-[20px] flex flex-col gap-[8px] text-[12px] text-[#94a3b8] sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-[6px]"><span className="size-[7px] rounded-full bg-[#16a34a]" /> Data refreshed 2 minutes ago</span>
            <span>All times shown in IST (India Standard Time)</span>
            <span>Data Source: 42 Integrated Sources</span>
          </div>
        </main>
      </div>
    </div>
  );
}
