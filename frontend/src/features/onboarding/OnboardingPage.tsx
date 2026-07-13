import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Code2,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Database,
  Ellipsis,
  Eye,
  Factory,
  Filter,
  Grid2X2,
  GraduationCap,
  HeartPulse,
  Landmark,
  Lock,
  Mail,
  MapPin,
  MoreVertical,
  Pencil,
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
  Zap,
} from "lucide-react";
import { useState } from "react";
import { FigmaLogo } from "../auth/LoginPage";
import goLiveRocketImage from "../../assets/figma/onboarding/go-live-rocket.png";
import heroImage from "../../assets/figma/onboarding/raw-image-1.png";
import arrowRightIcon from "../../assets/figma/onboarding/icons/arrow-right.svg";
import calendarIcon from "../../assets/figma/onboarding/icons/calendar.svg";
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
  calendar: calendarIcon,
  secure: secureIcon,
  arrowRight: arrowRightIcon,
};

const pageBackground =
  "linear-gradient(194.759deg, rgb(219, 219, 248) 23.984%, rgb(228, 227, 251) 48.487%), linear-gradient(90deg, rgb(255, 255, 255) 0%, rgb(255, 255, 255) 100%)";

const steps = [
  ["Workspace", "Setup"],
  ["Organization", "Setup"],
  ["Team", "Invitations"],
  ["Industry", "Selection"],
  ["Data Source", "Setup"],
  ["CRM", "Integration"],
  ["Trigger", "Generation"],
  ["ICP", "Generation"],
  ["Import", "Validation"],
  ["AI Business", "Discovery"],
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

const industries = [
  {
    title: "Software & SaaS",
    text: "Software, SaaS, Cloud Services, AI/ML, and related platforms.",
    icon: Code2,
    selected: true,
    iconClassName: "bg-[#dbeafe] text-[#005bff]",
  },
  {
    title: "Financial Services",
    text: "Banking, Insurance, FinTech, Investment, and Financial Services.",
    icon: Landmark,
    iconClassName: "bg-[#dcfce7] text-[#16a34a]",
  },
  {
    title: "Healthcare & Life Sciences",
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
    title: "Retail & E-commerce",
    text: "Retail, E-commerce, Marketplaces, and Consumer Goods.",
    icon: ShoppingCart,
    iconClassName: "bg-[#fce7f3] text-[#db2777]",
  },
  {
    title: "Technology Services",
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
    title: "Media & Entertainment",
    text: "Media, Entertainment, Publishing, Gaming, and Streaming.",
    icon: PlayCircle,
    iconClassName: "bg-[#fee2e2] text-[#f75317]",
  },
  {
    title: "Telecom",
    text: "Telecommunications, Networking, and Communication Services.",
    icon: RadioTower,
    iconClassName: "bg-[#cffafe] text-[#0891b2]",
  },
  {
    title: "Energy & Utilities",
    text: "Energy, Oil & Gas, Utilities, Renewable Energy, and Cleantech.",
    icon: Zap,
    iconClassName: "bg-[#fef3c7] text-[#f59e0b]",
  },
  {
    title: "Other",
    text: "Non-profit, Government, Logistics, Travel, and other industries.",
    icon: Ellipsis,
    iconClassName: "bg-[#eef2ff] text-[#312e81]",
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

const crmOptions = [
  {
    name: "Salesforce",
    logo: "salesforce",
    logoClassName: "bg-[#18a8e8] text-white",
    selected: true,
    helper: "Recommended",
  },
  {
    name: "HubSpot",
    logo: "hub",
    logoClassName: "bg-white text-[#ff5a1f]",
  },
  {
    name: "Microsoft Dynamics 365",
    logo: "D",
    logoClassName: "bg-[#eef2ff] text-[#312e81]",
  },
  {
    name: "Pipedrive",
    logo: "p",
    logoClassName: "bg-white text-[#111827]",
  },
  {
    name: "Zoho CRM",
    logo: "ZOHO",
    logoClassName: "bg-[#fef3c7] text-[#dc2626]",
  },
  {
    name: "Freshsales",
    logo: "f",
    logoClassName: "bg-[#fbbf24] text-white",
  },
  {
    name: "Insightly",
    logo: "in",
    logoClassName: "bg-white text-[#f97316]",
  },
  {
    name: "Nimble",
    logo: "*",
    logoClassName: "bg-white text-[#0284c7]",
  },
  {
    name: "Copper",
    logo: "copper",
    logoClassName: "bg-white text-[#111827]",
  },
  {
    name: "Custom CRM",
    logo: "db",
    logoClassName: "bg-white text-[#0f1f6f]",
  },
];

const salesforceBenefits = [
  {
    title: "Secure Connection",
    text: "Connect using OAuth 2.0 in a few clicks.",
    icon: Lock,
    className: "bg-[#eef2ff] text-[#005bff]",
  },
  {
    title: "Data We Sync",
    text: "Accounts, Contacts, Leads, Opportunities, Activities, and Campaigns.",
    icon: RefreshCcw,
    className: "bg-[#eef2ff] text-[#005bff]",
  },
  {
    title: "Real-time Sync",
    text: "Keep your data up-to-date with incremental syncs.",
    icon: Clock3,
    className: "bg-[#dcfce7] text-[#16a34a]",
  },
  {
    title: "Smart Mapping",
    text: "We'll help you map fields and avoid duplicates.",
    icon: Grid2X2,
    className: "bg-[#eef2ff] text-[#005bff]",
  },
];

const recommendedTriggers = [
  {
    name: "New Executive Hire",
    description: "New C-level or VP hire in Sales, Marketing, or Revenue teams.",
    priority: "High",
    score: 92,
    icon: Users,
    iconClassName: "bg-[#dcfce7] text-[#16a34a]",
    source: "in",
  },
  {
    name: "Funding Raised",
    description: "Company has raised new funding or funding round announced.",
    priority: "High",
    score: 89,
    icon: Target,
    iconClassName: "bg-[#ede9fe] text-[#7c3aed]",
    source: "cb",
  },
  {
    name: "Hiring Growth",
    description: "Significant increase in hiring activity across key departments.",
    priority: "High",
    score: 85,
    icon: TrendingUp,
    iconClassName: "bg-[#fff7ed] text-[#f97316]",
    source: "in",
  },
  {
    name: "Technology Adoption",
    description: "Company is adopting new technologies or tools.",
    priority: "Medium",
    score: 72,
    icon: Code2,
    iconClassName: "bg-[#eff6ff] text-[#005bff]",
    source: "api",
  },
  {
    name: "Geographic Expansion",
    description: "Company is expanding to new regions or countries.",
    priority: "Medium",
    score: 68,
    icon: Building2,
    iconClassName: "bg-[#fce7f3] text-[#db2777]",
    source: "in",
  },
  {
    name: "Competitor Switch",
    description: "Signals indicating a switch from a competitor or existing solution.",
    priority: "High",
    score: 88,
    icon: RefreshCcw,
    iconClassName: "bg-[#cffafe] text-[#0891b2]",
    source: "cb",
  },
  {
    name: "Product Launch",
    description: "New product or feature launch.",
    priority: "Medium",
    score: 65,
    icon: RadioTower,
    iconClassName: "bg-[#f3e8ff] text-[#9333ea]",
    source: "rss",
  },
  {
    name: "Company Growth",
    description: "High growth in revenue, headcount, or market share.",
    priority: "Medium",
    score: 70,
    icon: BarChart3,
    iconClassName: "bg-[#dcfce7] text-[#16a34a]",
    source: "cb",
  },
];

const icpLibraryRows = [
  {
    name: "Enterprise SaaS ICP",
    industry: "Software & SaaS",
    size: "201 - 500",
    revenue: "$10M - $250M",
    date: "May 20, 2025",
    status: "Active",
  },
  {
    name: "FinTech Growth ICP",
    industry: "Financial Services",
    size: "101 - 300",
    revenue: "$5M - $100M",
    date: "May 18, 2025",
    status: "Active",
  },
  {
    name: "Healthcare Tech ICP",
    industry: "Healthcare & Life Sciences",
    size: "51 - 200",
    revenue: "$5M - $50M",
    date: "May 15, 2025",
    status: "Inactive",
  },
  {
    name: "Manufacturing ICP",
    industry: "Manufacturing",
    size: "201 - 1000",
    revenue: "$20M - $500M",
    date: "May 10, 2025",
    status: "Active",
  },
  {
    name: "E-commerce ICP",
    industry: "Retail & E-commerce",
    size: "51 - 200",
    revenue: "$5M - $50M",
    date: "May 08, 2025",
    status: "Inactive",
  },
];

const onboardingLibraryRows = [
  ["1. Workspace Setup", "Set up your workspace and basic preferences", "Completed", "100%", "May 20, 2025"],
  ["2. Organization Setup", "Configure your organization profile and settings", "Completed", "100%", "May 20, 2025"],
  ["3. Team Invitations", "Invite your team members and set roles", "Completed", "100%", "May 20, 2025"],
  ["4. Industry Selection", "Select your industry and business focus", "Completed", "100%", "May 20, 2025"],
  ["5. AI Business Discovery", "AI analyzes your business and market context", "Completed", "100%", "May 20, 2025"],
  ["6. Trigger Generation", "Generate your relevant triggers with AI", "Completed", "100%", "May 20, 2025"],
  ["7. CRM Integration", "Connect and configure your CRM", "Completed", "100%", "May 20, 2025"],
  ["8. ICP Generation", "Generate your ideal customer profile with AI", "In Progress", "75%", "-"],
  ["9. Data Source Setup", "Configure your data sources and connections", "Pending", "0%", "-"],
  ["10. Import Validation", "Validate and import your data", "Pending", "0%", "-"],
  ["11. Go Live", "Complete setup and start your success journey", "Pending", "0%", "-"],
];

const businessDiscoverySources = [
  {
    name: "Company Website",
    description: "Scanning homepage, products, solutions, and resources",
    detail: "128 pages analyzed",
    time: "2 min ago",
    status: "Completed",
    icon: Database,
    iconClassName: "bg-[#f3e8ff] text-[#7c3aed]",
  },
  {
    name: "LinkedIn Company Page",
    description: "Analyzing company overview, posts, and team insights",
    detail: "1,245 data points",
    time: "2 min ago",
    status: "Completed",
    icon: Users,
    iconClassName: "bg-[#dbeafe] text-[#005bff]",
  },
  {
    name: "Public News & Press",
    description: "Reviewing recent news, announcements, and press releases",
    detail: "37 articles found",
    time: "5 min ago",
    status: "Completed",
    icon: Mail,
    iconClassName: "bg-[#eef2ff] text-[#4f46e5]",
  },
  {
    name: "Job Postings",
    description: "Analyzing open roles to understand growth and priorities",
    detail: "52 job postings",
    time: "8 min ago",
    status: "Completed",
    icon: BriefcaseBusiness,
    iconClassName: "bg-[#dbeafe] text-[#005bff]",
  },
  {
    name: "Technology Stack",
    description: "Detecting technologies and tools in use",
    detail: "Detecting technologies",
    time: "Just now",
    status: "Analyzing",
    icon: Code2,
    iconClassName: "bg-[#eef2ff] text-[#005bff]",
  },
  {
    name: "Funding & Financials",
    description: "Analyzing funding, revenue, and financial signals",
    detail: "Waiting to start",
    time: "-",
    status: "Pending",
    icon: BarChart3,
    iconClassName: "bg-[#fef3c7] text-[#b45309]",
  },
  {
    name: "Social Media Presence",
    description: "Scanning social channels for engagement insights",
    detail: "Waiting to start",
    time: "-",
    status: "Pending",
    icon: RadioTower,
    iconClassName: "bg-[#dbeafe] text-[#2563eb]",
  },
  {
    name: "Competitors & Market",
    description: "Identifying competitors and market positioning",
    detail: "Waiting to start",
    time: "-",
    status: "Pending",
    icon: Target,
    iconClassName: "bg-[#eef2ff] text-[#4f46e5]",
  },
  {
    name: "Customer Reviews",
    description: "Analyzing reviews and customer feedback",
    detail: "Waiting to start",
    time: "-",
    status: "Pending",
    icon: Eye,
    iconClassName: "bg-[#eef2ff] text-[#005bff]",
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
  "AI Business Discovery",
  "ICP Generation",
  "Trigger Generation",
  "CRM Integration",
  "Data Source Setup",
  "Import Validation",
  "Go Live",
];

type FieldProps = {
  icon: string;
  label: string;
  required?: boolean;
  value: string;
};

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

function TextField({ icon, label, required, value }: FieldProps) {
  return (
    <div className="flex flex-col gap-[8px]">
      <FieldLabel required={required}>{label}</FieldLabel>
      <div className="relative flex h-[42px] items-center rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc]">
        <img
          alt=""
          className="pointer-events-none absolute left-[12px] size-[20px]"
          src={icon}
        />
        <input
          className="h-full w-full rounded-[8px] bg-transparent pl-[41px] pr-[17px] font-['Inter'] text-[14px] leading-[20px] text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
          placeholder={value}
          type="text"
        />
      </div>
    </div>
  );
}

function FilledTextField({ icon, label, required, value }: FieldProps) {
  return (
    <div className="flex flex-col gap-[8px]">
      <FieldLabel required={required}>{label}</FieldLabel>
      <div className="relative flex h-[42px] items-center rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc]">
        <img
          alt=""
          className="pointer-events-none absolute left-[12px] size-[20px]"
          src={icon}
        />
        <input
          className="h-full w-full rounded-[8px] bg-transparent pl-[41px] pr-[17px] font-['Inter'] text-[14px] leading-[20px] text-[#0f172a] outline-none"
          defaultValue={value}
          type="text"
        />
      </div>
    </div>
  );
}

function SelectField({ icon, label, required, value }: FieldProps) {
  return (
    <div className="flex flex-col gap-[8px]">
      <FieldLabel required={required}>{label}</FieldLabel>
      <button
        className="relative flex h-[42px] w-full items-center rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] pl-[41px] pr-[36px] text-left font-['Inter'] text-[14px] leading-[20px] text-[#0f172a]"
        type="button"
      >
        <img
          alt=""
          className="pointer-events-none absolute left-[12px] size-[20px]"
          src={icon}
        />
        <span className="block min-w-0 truncate">{value}</span>
        <ChevronDown
          aria-hidden="true"
          className="absolute right-[12px] size-[17px] text-[#64748b]"
          strokeWidth={2}
        />
      </button>
    </div>
  );
}

function WorkspaceUrlField() {
  return (
    <div className="flex flex-col gap-[8px]">
      <FieldLabel required>Workspace URL</FieldLabel>
      <div className="flex h-[42px] w-full overflow-hidden rounded-[8px] font-['Inter'] text-[14px] leading-[20px]">
        <div className="flex items-center border border-r-0 border-[#e2e8f0] bg-[#f8fafc] px-[13px] text-[#64748b]">
          https://
        </div>
        <input
          className="min-w-0 flex-1 border border-[#e2e8f0] bg-[#f8fafc] px-[17px] text-[#6b7280] outline-none"
          defaultValue="acme-corp"
          type="text"
        />
        <div className="w-[24px] border border-l-0 border-[#e2e8f0] bg-[#f8fafc]" />
      </div>
    </div>
  );
}

function LogoUpload() {
  return (
    <div className="flex flex-col gap-[8px]">
      <FieldLabel>Workspace Logo</FieldLabel>
      <button
        className="flex h-[119px] w-full flex-col items-center justify-center rounded-[12px] border-2 border-dashed border-[#e2e8f0] bg-[#f8fafc] px-[34px] py-[20px]"
        type="button"
      >
        <span className="flex size-[48px] items-center justify-center rounded-full bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <img alt="" className="size-[24px]" src={icons.upload} />
        </span>
        <span className="mt-[12px] font-['Inter'] text-[14px] font-bold leading-[20px] text-[#4f46e5]">
          Upload Logo
        </span>
        <span className="mt-[1px] font-['Inter'] text-[11px] font-normal leading-[16.5px] text-[#94a3b8]">
          SVG, PNG or JPG (max. 2MB)
        </span>
      </button>
      <p className="m-0 pt-[4px] font-['Inter'] text-[11px] italic leading-[16.5px] text-[#94a3b8]">
        Recommended: 512x512px
      </p>
    </div>
  );
}

function WorkspaceSetupForm() {
  return (
    <div className="grid grid-cols-1 gap-x-[20px] gap-y-[19px] md:grid-cols-2">
      <TextField
        icon={icons.workspace}
        label="Workspace Name"
        required
        value="Enter workspace name"
      />
      <SelectField
        icon={icons.globe}
        label="Time Zone"
        required
        value="(GMT-05:00) Eastern Time (Cana..."
      />
      <WorkspaceUrlField />
      <SelectField
        icon={icons.currency}
        label="Currency"
        required
        value="USD - US Dollar ( $ )"
      />
      <LogoUpload />
      <div className="flex flex-col gap-[24px]">
        <SelectField
          icon={icons.globe}
          label="Language"
          required
          value="English (US)"
        />
        <SelectField
          icon={icons.calendar}
          label="Date Format"
          required
          value="MM/DD/YYYY"
        />
      </div>
    </div>
  );
}

function OrganizationSetupForm() {
  return (
    <div className="grid grid-cols-1 gap-x-[20px] gap-y-[16px] md:grid-cols-2">
      <FilledTextField
        icon={icons.workspace}
        label="Company Name"
        required
        value="Acme Technologies Inc."
      />
      <FilledTextField
        icon={icons.globe}
        label="Website"
        required
        value="https://www.acmetech.com"
      />
      <FilledTextField
        icon={icons.workspace}
        label="Legal Business Name"
        value="Acme Technologies Incorporated"
      />
      <SelectField
        icon={icons.workspace}
        label="Industry"
        required
        value="Software"
      />
      <SelectField
        icon={icons.currency}
        label="Sub Industry"
        value="Sales Intelligence"
      />
      <SelectField
        icon={icons.workspace}
        label="Business Type"
        value="B2B"
      />
      <FilledTextField
        icon={icons.globe}
        label="Headquarters Location"
        required
        value="San Francisco, California, USA"
      />
      <FilledTextField
        icon={icons.calendar}
        label="Founded Year"
        value="2015"
      />
      <SelectField
        icon={icons.workspace}
        label="Company Size (Employees)"
        required
        value="201 - 500"
      />
      <SelectField
        icon={icons.currency}
        label="Annual Revenue"
        required
        value="$50M - $100M"
      />
      <SelectField
        icon={icons.calendar}
        label="Time in Business"
        required
        value="6 - 10 Years"
      />

      <div className="flex flex-col gap-[8px] md:col-span-2">
        <FieldLabel>Company Description</FieldLabel>
        <textarea
          className="min-h-[74px] w-full resize-none rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] px-[14px] py-[12px] font-['Inter'] text-[13px] font-normal leading-[20px] text-[#0f172a] outline-none"
          defaultValue="Acme Technologies provides an AI-powered sales intelligence platform that helps revenue teams identify high-potential prospects, track buying signals, and close more deals faster."
          maxLength={500}
        />
        <div className="flex min-h-[36px] items-center rounded-[8px] border border-[#bfdbfe] bg-[#eff6ff] px-[12px] font-['Inter'] text-[12px] leading-[18px] text-[#1e40af]">
          This information helps our AI models deliver more relevant insights
          and recommendations.
        </div>
      </div>
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

function IndustrySelectionForm() {
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2 xl:grid-cols-3">
        {industries.map((industry) => {
          const Icon = industry.icon;

          return (
            <button
              className={`relative flex min-h-[96px] items-start gap-[14px] rounded-[10px] border bg-white p-[13px] text-left transition ${
                industry.selected
                  ? "border-[#4f46e5] shadow-[0px_0px_0px_1px_rgba(79,70,229,0.08)]"
                  : "border-[#e2e8f0]"
              }`}
              key={industry.title}
              type="button"
            >
              <span
                className={`flex size-[48px] shrink-0 items-center justify-center rounded-[8px] ${industry.iconClassName}`}
              >
                <Icon aria-hidden="true" className="size-[25px]" strokeWidth={2.1} />
              </span>
              <span className="min-w-0">
                <span className="block font-['Inter'] text-[14px] font-bold leading-[20px] text-[#0f1f6f]">
                  {industry.title}
                </span>
                <span className="mt-[5px] block font-['Inter'] text-[11px] font-medium leading-[18px] text-[#0f1f6f]">
                  {industry.text}
                </span>
              </span>
              {industry.selected && (
                <span className="absolute right-[8px] top-[8px] flex size-[22px] items-center justify-center rounded-full bg-[#005bff] text-white">
                  <Check aria-hidden="true" className="size-[14px]" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-[40px] items-center gap-[10px] rounded-[8px] border border-[#bfdbfe] bg-[#eff6ff] px-[14px] font-['Inter'] text-[12px] font-medium leading-[18px] text-[#1e40af]">
        <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full border border-[#005bff] text-[#005bff]">
          i
        </span>
        You can update or add multiple industries later in Workspace Settings.
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

function CrmLogo({
  logo,
  className,
}: {
  logo: string;
  className: string;
}) {
  if (logo === "db") {
    return (
      <span className={`flex size-[52px] items-center justify-center rounded-[10px] ${className}`}>
        <Database aria-hidden="true" className="size-[31px]" strokeWidth={2} />
      </span>
    );
  }

  return (
    <span
      className={`flex size-[52px] items-center justify-center rounded-[10px] font-['Inter'] text-[20px] font-black ${className}`}
    >
      {logo}
    </span>
  );
}

function CrmIntegrationForm() {
  return (
    <div className="flex flex-col gap-[14px]">
      <div>
        <h3 className="m-0 font-['Inter'] text-[18px] font-bold leading-[27px] text-[#0f1f6f]">
          Connect Your CRM
        </h3>
        <p className="m-0 mt-[2px] font-['Inter'] text-[13px] font-medium leading-[20px] text-[#0f1f6f]">
          Choose your CRM platform to get started.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-[12px] lg:grid-cols-5">
        {crmOptions.map((crm) => (
          <button
            className={`relative flex min-h-[118px] flex-col items-center justify-center gap-[10px] rounded-[10px] border bg-white p-[12px] text-center transition ${
              crm.selected
                ? "border-[#4f46e5] shadow-[0px_0px_0px_1px_rgba(79,70,229,0.08)]"
                : "border-[#e2e8f0]"
            }`}
            key={crm.name}
            type="button"
          >
            <CrmLogo className={crm.logoClassName} logo={crm.logo} />
            <span className="font-['Inter'] text-[12px] font-bold leading-[17px] text-[#0f1f6f]">
              {crm.name}
            </span>
            {crm.helper && (
              <span className="font-['Inter'] text-[11px] font-bold leading-[13px] text-[#16a34a]">
                {crm.helper}
              </span>
            )}
            {crm.selected && (
              <span className="absolute right-[8px] top-[8px] flex size-[22px] items-center justify-center rounded-full bg-[#005bff] text-white">
                <Check aria-hidden="true" className="size-[14px]" strokeWidth={3} />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-[12px] border border-[#e2e8f0] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#e2e8f0] px-[14px] py-[14px] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-[12px]">
            <CrmLogo className="bg-[#18a8e8] text-white" logo="salesforce" />
            <div>
              <h3 className="m-0 font-['Inter'] text-[17px] font-bold leading-[23px] text-[#0f1f6f]">
                Salesforce Integration
              </h3>
              <p className="m-0 mt-[2px] font-['Inter'] text-[12px] font-medium leading-[18px] text-[#0f1f6f]">
                Securely connect your Salesforce account to import and sync your
                data.
              </p>
              <button
                className="mt-[3px] font-['Inter'] text-[12px] font-medium leading-[18px] text-[#005bff]"
                type="button"
              >
                Learn more about Salesforce integration
              </button>
            </div>
          </div>
          <button
            className="h-[34px] whitespace-nowrap rounded-[8px] border border-[#e2e8f0] bg-white px-[16px] font-['Inter'] text-[12px] font-bold text-[#005bff]"
            type="button"
          >
            View Integration Guide
          </button>
        </div>

        <div className="grid grid-cols-1 gap-[12px] px-[14px] py-[14px] md:grid-cols-2 xl:grid-cols-4">
          {salesforceBenefits.map((benefit) => {
            const Icon = benefit.icon;

            return (
              <div className="flex gap-[10px]" key={benefit.title}>
                <span
                  className={`flex size-[34px] shrink-0 items-center justify-center rounded-[8px] ${benefit.className}`}
                >
                  <Icon aria-hidden="true" className="size-[20px]" strokeWidth={2.2} />
                </span>
                <div>
                  <p className="m-0 font-['Inter'] text-[11px] font-bold leading-[16px] text-[#0f1f6f]">
                    {benefit.title}
                  </p>
                  <p className="m-0 mt-[3px] font-['Inter'] text-[10px] font-medium leading-[16px] text-[#0f1f6f]">
                    {benefit.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mx-[14px] mb-[14px] flex min-h-[42px] items-center gap-[10px] rounded-[8px] border border-[#fed7aa] bg-[#fff7ed] px-[12px] font-['Inter'] text-[12px] font-bold leading-[18px] text-[#92400e]">
          <ShieldCheck aria-hidden="true" className="size-[18px] text-[#92400e]" />
          Your data is safe with us. We never sell your data and only access
          what's needed to deliver insights.
        </div>
      </div>
    </div>
  );
}

function SourcePill({ source }: { source: string }) {
  const sourceClassName =
    source === "in"
      ? "bg-[#dbeafe] text-[#005bff]"
      : source === "cb"
        ? "bg-[#d1fae5] text-[#059669]"
        : source === "rss"
          ? "bg-[#ffedd5] text-[#f75317]"
          : "bg-[#eef2ff] text-[#4f46e5]";

  return (
    <span
      className={`inline-flex size-[24px] items-center justify-center rounded-[6px] font-['Inter'] text-[10px] font-black lowercase ${sourceClassName}`}
    >
      {source}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const isHigh = priority === "High";

  return (
    <span
      className={`inline-flex h-[26px] items-center rounded-[6px] px-[10px] font-['Inter'] text-[11px] font-bold ${
        isHigh ? "bg-[#fee2e2] text-[#ef4444]" : "bg-[#ffedd5] text-[#f97316]"
      }`}
    >
      {priority}
    </span>
  );
}

function TriggerGenerationForm() {
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-[8px]">
          {[
            ["All Triggers", "42", "border-[#005bff] text-[#005bff]"],
            ["High Priority", "12", "border-[#fecaca] bg-[#fff1f2] text-[#ef4444]"],
            ["Medium Priority", "18", "border-[#fed7aa] bg-[#fff7ed] text-[#f97316]"],
            ["Low Priority", "12", "border-[#bbf7d0] bg-[#f0fdf4] text-[#16a34a]"],
          ].map(([label, count, className]) => (
            <button
              className={`flex h-[34px] items-center gap-[8px] rounded-[8px] border px-[12px] font-['Inter'] text-[11px] font-bold ${className}`}
              key={label}
              type="button"
            >
              {label}
              <span className="rounded-full bg-white/80 px-[7px] py-[2px] text-[10px]">
                {count}
              </span>
            </button>
          ))}
        </div>
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
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#e2e8f0] text-left">
              {["Trigger", "Description", "Priority", "Intent Score", "Data Source", "Status"].map(
                (heading) => (
                  <th
                    className="px-[12px] py-[11px] font-['Inter'] text-[11px] font-bold leading-[16px] text-[#0f1f6f]"
                    key={heading}
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {recommendedTriggers.map((trigger) => {
              const Icon = trigger.icon;

              return (
                <tr className="border-b border-[#f1f5f9] last:border-b-0" key={trigger.name}>
                  <td className="px-[12px] py-[9px]">
                    <div className="flex items-center gap-[10px]">
                      <span
                        className={`flex size-[32px] shrink-0 items-center justify-center rounded-[8px] ${trigger.iconClassName}`}
                      >
                        <Icon aria-hidden="true" className="size-[18px]" />
                      </span>
                      <span className="font-['Inter'] text-[11px] font-bold leading-[16px] text-[#0f1f6f]">
                        {trigger.name}
                      </span>
                    </div>
                  </td>
                  <td className="max-w-[210px] px-[12px] py-[9px] font-['Inter'] text-[11px] font-medium leading-[17px] text-[#0f1f6f]">
                    {trigger.description}
                  </td>
                  <td className="px-[12px] py-[9px]">
                    <PriorityBadge priority={trigger.priority} />
                  </td>
                  <td className="px-[12px] py-[9px]">
                    <div className="flex items-center gap-[10px]">
                      <span className="h-[5px] w-[80px] overflow-hidden rounded-full bg-[#e2e8f0]">
                        <span
                          className="block h-full rounded-full bg-[#16a34a]"
                          style={{ width: `${trigger.score}%` }}
                        />
                      </span>
                      <span className="font-['Inter'] text-[11px] font-bold text-[#0f1f6f]">
                        {trigger.score}%
                      </span>
                    </div>
                  </td>
                  <td className="px-[12px] py-[9px]">
                    <div className="flex gap-[6px]">
                      <SourcePill source={trigger.source} />
                      <button
                        className="flex size-[24px] items-center justify-center rounded-[6px] border border-[#e2e8f0] bg-white text-[#0f1f6f]"
                        type="button"
                      >
                        <MoreVertical aria-hidden="true" className="size-[14px]" />
                      </button>
                    </div>
                  </td>
                  <td className="px-[12px] py-[9px]">
                    <button
                      aria-label={`${trigger.name} enabled`}
                      className="relative h-[20px] w-[36px] rounded-full bg-gradient-to-r from-[#7c3aed] to-[#4f46e5]"
                      type="button"
                    >
                      <span className="absolute right-[2px] top-[2px] size-[16px] rounded-full bg-white shadow-sm" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 font-['Inter'] text-[12px] font-medium leading-[18px] text-[#64748b]">
          Showing 1 to 8 of 42 triggers
        </p>
        <div className="flex items-center gap-[6px]">
          {["1", "2", "3", "4", "5", "..."].map((page) => (
            <button
              className={`flex size-[30px] items-center justify-center rounded-[6px] border font-['Inter'] text-[11px] font-medium ${
                page === "1"
                  ? "border-[#4f46e5] text-[#4f46e5]"
                  : "border-[#e2e8f0] text-[#64748b]"
              }`}
              key={page}
              type="button"
            >
              {page}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function IcpInputField({
  icon: Icon,
  label,
  placeholder,
  required = false,
  wide = false,
}: {
  icon: typeof BriefcaseBusiness;
  label: string;
  placeholder: string;
  required?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-[8px] ${wide ? "md:col-span-2" : ""}`}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <div className="relative flex h-[42px] items-center rounded-[8px] border border-[#e2e8f0] bg-white">
        <Icon aria-hidden="true" className="absolute left-[12px] size-[18px] text-[#4f46e5]" />
        <span className="truncate pl-[41px] pr-[36px] font-['Inter'] text-[12px] font-medium text-[#64748b]">
          {placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="absolute right-[12px] size-[16px] text-[#0f1f6f]"
        />
      </div>
    </div>
  );
}

function IcpGenerationForm() {
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2 xl:grid-cols-3">
        <IcpInputField icon={BriefcaseBusiness} label="Primary Industry" placeholder="Select or type industry" required />
        <IcpInputField icon={Users} label="Company Size (Employees)" placeholder="Select company size" required />
        <IcpInputField icon={BarChart3} label="Annual Revenue" placeholder="Select revenue range" required />
        <IcpInputField icon={MapPin} label="Headquarters Location" placeholder="Select headquarters location" required />
        <IcpInputField icon={TrendingUp} label="Growth Stage" placeholder="Select growth stage" required />
        <IcpInputField icon={Building2} label="Business Model" placeholder="Select business model" required />
        <IcpInputField icon={Code2} label="Technologies Used" placeholder="Select or type technologies (e.g., AWS, Salesforce, HubSpot)" wide />
        <IcpInputField icon={User} label="Buying Committee (Key Roles)" placeholder="Select or type key roles (e.g., VP Sales, CRO)" />
      </div>

      <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2">
        {[
          ["Pain Points", "Enter main pain points"],
          ["Business Goals", "Enter key business goals"],
        ].map(([label, placeholder]) => (
          <div className="flex flex-col gap-[8px]" key={label}>
            <FieldLabel>{label}</FieldLabel>
            <textarea
              className="min-h-[58px] resize-none rounded-[8px] border border-[#e2e8f0] bg-white px-[12px] py-[10px] font-['Inter'] text-[12px] font-medium text-[#0f172a] outline-none placeholder:text-[#64748b]"
              placeholder={placeholder}
            />
          </div>
        ))}
      </div>

      <div className="rounded-[12px] border border-[#e2e8f0] bg-white p-[14px]">
        <div className="mb-[10px] flex items-center justify-between gap-3">
          <div>
            <h3 className="m-0 font-['Inter'] text-[17px] font-bold leading-[23px] text-[#0f1f6f]">
              Your ICP Library
            </h3>
            <p className="m-0 mt-[2px] font-['Inter'] text-[11px] font-medium leading-[17px] text-[#0f1f6f]">
              Create and manage multiple ICPs for different target segments.
            </p>
          </div>
          <button
            className="h-[36px] rounded-[8px] bg-[#005bff] px-[16px] font-['Inter'] text-[12px] font-bold text-white"
            type="button"
          >
            + Create New ICP
          </button>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left">
              {["ICP Name", "Primary Industry", "Company Size", "Annual Revenue", "Status", "Actions"].map(
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
            {icpLibraryRows.map((row) => (
              <tr className="border-t border-[#f1f5f9]" key={row.name}>
                <td className="px-[4px] py-[8px] font-['Inter'] text-[11px] font-bold text-[#0f1f6f]">
                  {row.name}
                </td>
                <td className="px-[4px] py-[8px] font-['Inter'] text-[11px] font-medium text-[#0f1f6f]">
                  {row.industry}
                </td>
                <td className="px-[4px] py-[8px] font-['Inter'] text-[11px] font-medium text-[#0f1f6f]">
                  {row.size}
                </td>
                <td className="px-[4px] py-[8px] font-['Inter'] text-[11px] font-medium text-[#0f1f6f]">
                  {row.revenue}
                </td>
                <td className="px-[4px] py-[8px]">
                  <span
                    className={`rounded-[6px] px-[9px] py-[4px] font-['Inter'] text-[10px] font-bold ${
                      row.status === "Active"
                        ? "bg-[#dcfce7] text-[#16a34a]"
                        : "bg-[#eef2ff] text-[#4f46e5]"
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-[4px] py-[8px]">
                  <div className="flex gap-[10px] text-[#0f1f6f]">
                    <Eye aria-hidden="true" className="size-[14px]" />
                    <Pencil aria-hidden="true" className="size-[14px]" />
                    <MoreVertical aria-hidden="true" className="size-[14px]" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IcpLibraryForm() {
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
        <div className="rounded-[10px] border border-[#e2e8f0] bg-white p-[12px]">
          <p className="m-0 font-['Inter'] text-[11px] font-bold text-[#0f1f6f]">
            Overall Progress
          </p>
          <div className="mt-[6px] flex items-center gap-[12px]">
            <span className="font-['Inter'] text-[22px] font-bold leading-none text-[#0f1f6f]">
              78%
            </span>
            <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-[#e2e8f0]">
              <span className="block h-full w-[78%] rounded-full bg-[#16a34a]" />
            </span>
          </div>
        </div>
        <div className="rounded-[10px] border border-[#e2e8f0] bg-white p-[12px]">
          <p className="m-0 font-['Inter'] text-[11px] font-bold text-[#0f1f6f]">
            Estimated Time Remaining
          </p>
          <div className="mt-[8px] flex items-center gap-[8px] font-['Inter'] text-[18px] font-bold text-[#0f1f6f]">
            <Clock3 aria-hidden="true" className="size-[18px] text-[#005bff]" />
            12 min
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-[#e2e8f0] bg-white">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#e2e8f0] text-left">
              {["Step", "Description", "Status", "Progress", "Completed On", "Action"].map(
                (heading) => (
                  <th
                    className="px-[12px] py-[10px] font-['Inter'] text-[10px] font-bold text-[#0f1f6f]"
                    key={heading}
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {onboardingLibraryRows.map(([step, description, status, progress, date], index) => {
              const progressValue = Number.parseInt(progress, 10);
              const isComplete = status === "Completed";
              const isInProgress = status === "In Progress";

              return (
                <tr className="border-b border-[#f1f5f9] last:border-b-0" key={step}>
                  <td className="px-[12px] py-[8px]">
                    <div className="flex items-center gap-[9px]">
                      <span
                        className={`flex size-[28px] shrink-0 items-center justify-center rounded-[7px] ${
                          isComplete
                            ? "bg-[#dcfce7] text-[#16a34a]"
                            : isInProgress
                              ? "bg-[#f3e8ff] text-[#7c3aed]"
                              : "bg-[#eef2ff] text-[#005bff]"
                        }`}
                      >
                        {isComplete ? (
                          <Check aria-hidden="true" className="size-[15px]" />
                        ) : (
                          <CalendarDays aria-hidden="true" className="size-[15px]" />
                        )}
                      </span>
                      <span className="font-['Inter'] text-[11px] font-bold text-[#0f1f6f]">
                        {step}
                      </span>
                    </div>
                  </td>
                  <td className="max-w-[190px] px-[12px] py-[8px] font-['Inter'] text-[10px] font-medium leading-[15px] text-[#0f1f6f]">
                    {description}
                  </td>
                  <td className="px-[12px] py-[8px]">
                    <span
                      className={`whitespace-nowrap rounded-[6px] px-[8px] py-[4px] font-['Inter'] text-[10px] font-bold ${
                        isComplete
                          ? "bg-[#dcfce7] text-[#16a34a]"
                          : isInProgress
                            ? "bg-[#f3e8ff] text-[#7c3aed]"
                            : "bg-[#e2e8f0] text-[#0f1f6f]"
                      }`}
                    >
                      {status}
                    </span>
                  </td>
                  <td className="px-[12px] py-[8px]">
                    <div className="flex items-center gap-[8px]">
                      <span className="h-[5px] w-[88px] overflow-hidden rounded-full bg-[#e2e8f0]">
                        <span
                          className={`block h-full rounded-full ${
                            isInProgress
                              ? "bg-gradient-to-r from-[#7c3aed] to-[#db2777]"
                              : "bg-[#16a34a]"
                          }`}
                          style={{ width: `${progressValue}%` }}
                        />
                      </span>
                      <span className="font-['Inter'] text-[10px] font-bold text-[#0f1f6f]">
                        {progress}
                      </span>
                    </div>
                  </td>
                  <td className="px-[12px] py-[8px] font-['Inter'] text-[10px] font-medium leading-[15px] text-[#0f1f6f]">
                    {date}
                  </td>
                  <td className="px-[12px] py-[8px]">
                    <button
                      className={`h-[30px] rounded-[6px] border px-[14px] font-['Inter'] text-[11px] font-bold ${
                        index === 7
                          ? "border-[#c084fc] text-[#7c3aed]"
                          : "border-[#e2e8f0] text-[#0f1f6f]"
                      }`}
                      type="button"
                    >
                      {index < 7 ? "View" : index === 7 ? "Continue" : "Start"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex min-h-[58px] flex-col gap-3 rounded-[10px] border border-[#e9d5ff] bg-[#faf5ff] px-[14px] py-[12px] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-[12px]">
          <Target aria-hidden="true" className="size-[22px] text-[#7c3aed]" />
          <p className="m-0 font-['Inter'] text-[12px] font-bold leading-[18px] text-[#0f1f6f]">
            Complete all onboarding steps to get the most accurate AI insights and recommendations.
          </p>
        </div>
        <button
          className="h-[36px] shrink-0 rounded-[8px] border border-[#d8b4fe] bg-white px-[18px] font-['Inter'] text-[12px] font-bold text-[#7c3aed]"
          type="button"
        >
          View Best Practices
        </button>
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

  return (
    <span className="inline-flex items-center gap-[8px] font-['Inter'] text-[11px] font-bold text-[#64748b]">
      <Clock3 aria-hidden="true" className="size-[15px]" />
      Pending
    </span>
  );
}

function AiBusinessDiscoveryForm() {
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
              AI Analysis in Progress
            </h3>
            <p className="m-0 mt-[14px] font-['Inter'] text-[13px] font-medium leading-[21px] text-[#0f1f6f]">
              XSparks AI is discovering key information about your business from
              multiple sources.
            </p>
            <button
              className="mt-[12px] font-['Inter'] text-[13px] font-bold leading-[20px] text-[#005bff]"
              type="button"
            >
              Learn more about our AI discovery process
            </button>
          </div>
        </div>

          <div className="w-full max-w-[300px] pt-[6px]">
          <div className="mb-[14px] flex items-center justify-between">
            <span className="font-['Inter'] text-[13px] font-bold text-[#0f1f6f]">
              Analyzing... 7 of 9 sources
            </span>
            <span className="font-['Inter'] text-[13px] font-bold text-[#0f1f6f]">
              78% Complete
            </span>
          </div>
          <span className="block h-[8px] overflow-hidden rounded-full bg-[#e2e8f0]">
            <span className="block h-full w-[78%] rounded-full bg-gradient-to-r from-[#005bff] via-[#7c3aed] to-[#db2777]" />
          </span>
        </div>
        </div>
      </div>

      <div className="rounded-[12px] border border-[#e2e8f0] bg-white p-[20px]">
        <h3 className="m-0 font-['Inter'] text-[22px] font-bold leading-[28px] text-[#0f1f6f]">
          Sources Being Analyzed
        </h3>

        <div className="mt-[16px] flex flex-col gap-[10px]">
          {businessDiscoverySources.map((source) => {
            const Icon = source.icon;

            return (
              <div
                className="grid grid-cols-1 gap-[10px] rounded-[8px] px-[8px] py-[4px] sm:grid-cols-[minmax(0,1fr)_110px_132px] sm:items-center sm:gap-[18px]"
                key={source.name}
              >
                <div className="flex min-w-0 items-center gap-[14px]">
                  <span
                    className={`flex size-[34px] shrink-0 items-center justify-center rounded-[8px] ${source.iconClassName}`}
                  >
                    <Icon aria-hidden="true" className="size-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <p className="m-0 font-['Inter'] text-[13px] font-bold leading-[18px] text-[#0f1f6f]">
                      {source.name}
                    </p>
                    <p className="m-0 mt-[2px] font-['Inter'] text-[11px] font-medium leading-[16px] text-[#0f1f6f]">
                      {source.description}
                    </p>
                  </div>
                </div>

                <DiscoveryStatus status={source.status} />
                <div>
                  <p className="m-0 font-['Inter'] text-[11px] font-bold leading-[16px] text-[#0f1f6f]">
                    {source.detail}
                  </p>
                  <p className="m-0 mt-[1px] font-['Inter'] text-[11px] font-medium leading-[16px] text-[#0f1f6f]">
                    {source.time}
                  </p>
                </div>
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
                  You're All Set!
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
  const [activeStep, setActiveStep] = useState(0);
  const isOrganizationStep = activeStep === 1;
  const isTeamStep = activeStep === 2;
  const isIndustryStep = activeStep === 3;
  const isDataSourceStep = activeStep === 4;
  const isCrmStep = activeStep === 5;
  const isTriggerStep = activeStep === 6;
  const isIcpStep = activeStep === 7;
  const isIcpLibraryStep = activeStep === 8;
  const isAiBusinessStep = activeStep === 9;
  const isGoLiveStep = activeStep === 10;
  const stepperStep = activeStep;
  const formViewportClassName = `mt-[18px] overflow-hidden transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
    activeStep === 0 ? "h-[362px]" : "h-[430px]"
  }`;

  const handlePrimaryAction = () => {
    setActiveStep((step) => Math.min(step + 1, 10));
  };

  const handleSecondaryAction = () => {
    if (activeStep > 0) {
      setActiveStep((step) => step - 1);
    }
  };

  return (
    <section className="relative z-20 flex min-h-[720px] w-full flex-col bg-white px-[36px] pb-[18px] pt-[34px]">
      <OnboardingStepper activeStep={stepperStep} />

      <div className="mt-[39px]">
        <h2 className="m-0 font-['Inter'] text-[18px] font-bold leading-[27px] text-[#1e293b]">
          {isGoLiveStep
            ? "Go Live"
            : isAiBusinessStep
            ? "AI Analysis in Progress"
            : isIcpLibraryStep
            ? "ICP Library"
            : isIcpStep
              ? "Define Your Ideal Customer Profile (Manual Input)"
              : isTriggerStep
                ? "Recommended Triggers (AI Suggested)"
                : isCrmStep
                  ? "Connect Your CRM"
                  : isDataSourceStep
                    ? "Connect Your Data Sources"
                    : isIndustryStep
                      ? "Choose Your Primary Industry"
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
            ? "Our AI is analyzing your business to build a powerful foundation for personalized insights."
            : isIcpLibraryStep
            ? "Track your onboarding journey and setup progress."
            : isIcpStep
              ? "Provide the key details about your ideal customer. This will help AI generate accurate insights."
              : isTriggerStep
                ? "AI analyzes your industry, ICP, and market data to find the highest intent signals."
                : isCrmStep
                  ? "Connect your CRM to sync data, track activities, and unlock actionable insights."
                  : isDataSourceStep
                    ? "Connect external data sources to enrich profiles, detect buying signals, and power AI insights."
                    : isIndustryStep
                      ? "Your selection helps our AI deliver relevant triggers, benchmarks, and recommendations."
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
          style={{ transform: `translateX(-${activeStep * 100}%)` }}
        >
          <div className="h-full w-full shrink-0">
            <WorkspaceSetupForm />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]">
            <OrganizationSetupForm />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]">
            <TeamInvitationsForm />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]">
            <IndustrySelectionForm />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]">
            <DataSourceSetupForm />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]">
            <CrmIntegrationForm />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]">
            <TriggerGenerationForm />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]">
            <IcpGenerationForm />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]">
            <IcpLibraryForm />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]">
            <AiBusinessDiscoveryForm />
          </div>
          <div className="h-full w-full shrink-0 overflow-y-auto pr-[6px]">
            <GoLiveForm />
          </div>
        </div>
      </div>

      <footer className="mt-auto flex min-h-[79px] flex-col gap-5 border-t border-[#f1f5f9] pt-[24px] sm:flex-row sm:items-center sm:justify-between">
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
            className="flex h-[44px] items-center gap-[8px] rounded-[12px] bg-gradient-to-r from-[#f75317] via-[#7c3aed] via-[58.173%] to-[#0c20ff] to-[97.115%] px-[40px] py-[12px] shadow-[0px_10px_15px_-3px_#c7d2fe,0px_4px_6px_-4px_#c7d2fe]"
            onClick={handlePrimaryAction}
            type="button"
          >
            <span className="font-['Inter'] text-[14px] font-bold leading-[20px] text-white">
              {isGoLiveStep
                ? "Start Using XSparks"
                : isAiBusinessStep || isIcpLibraryStep
                ? "Continue"
                : isCrmStep
                ? "Connect Salesforce"
                : activeStep > 0
                  ? "Save & Continue"
                  : "Continue"}
            </span>
            <img alt="" className="size-[16px]" src={icons.arrowRight} />
          </button>
        </div>
      </footer>
    </section>
  );
}

export function OnboardingPage() {
  return (
    <main
      className="min-h-screen overflow-x-hidden px-[clamp(1.5rem,4vw,3rem)] py-[clamp(1.125rem,2.4vh,2rem)]"
      style={{ backgroundImage: pageBackground }}
    >
      <div className="relative mx-auto grid min-h-[720px] w-full max-w-[1440px] overflow-hidden rounded-[24px] bg-white shadow-[0px_18px_45px_rgba(15,23,42,0.10)] lg:grid-cols-[clamp(300px,26vw,350px)_minmax(0,1fr)]">
        <section className="relative z-10 flex min-h-[360px] flex-col overflow-hidden bg-[#eef2ff] px-[28px] py-[30px] lg:min-h-0 lg:px-[38px] lg:py-[42px]">
          <img
            alt=""
            className="pointer-events-none absolute inset-0 z-0 h-full w-full select-none object-cover object-bottom opacity-95"
            draggable={false}
            src={heroImage}
          />
          <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-white/90 via-white/55 via-[34%] to-white/10" />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[52%] bg-white/25 backdrop-blur-[1px]" />
          <FigmaLogo className="relative z-10 origin-left scale-95 lg:scale-100" />

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

        <div className="relative z-20 min-w-0 border-t border-[#e2e8f0] lg:border-l lg:border-t-0">
          <OnboardingCard />
        </div>
      </div>
    </main>
  );
}
