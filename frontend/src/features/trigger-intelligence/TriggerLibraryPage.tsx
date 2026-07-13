import {
  Activity,
  ArrowRight,
  Banknote,
  Building2,
  ChevronRight,
  Download,
  Filter,
  Globe,
  Heart,
  LayoutGrid,
  LineChart,
  Megaphone,
  Package,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import type { ComponentType } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Donut } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

type IconType = ComponentType<{ className?: string }>;

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

type Category = {
  name: string;
  desc: string;
  icon: IconType;
  color: string;
  bg: string;
  count: number;
  pct: string;
  signals: string;
  vol: number;
  companies: string;
  score: number;
};

const categories: Category[] = [
  { name: "Funding & Investment", desc: "Track funding rounds, investor activity, and capital raises.", icon: Banknote, color: "#7c3aed", bg: "#f3e9ff", count: 42, pct: "17.4%", signals: "1,247", vol: 1247, companies: "8.6K", score: 87 },
  { name: "Hiring & Talent", desc: "Monitor hiring trends, key hires, and team expansions.", icon: UserPlus, color: "#f97316", bg: "#fff1e3", count: 38, pct: "15.7%", signals: "1,846", vol: 1846, companies: "9.2K", score: 85 },
  { name: "Product & Innovation", desc: "New product launches, feature releases, and innovations.", icon: Package, color: "#2563eb", bg: "#e6f0ff", count: 36, pct: "14.9%", signals: "1,532", vol: 1532, companies: "7.8K", score: 84 },
  { name: "Company Expansion", desc: "Track expansions, new offices, and geographic growth.", icon: Building2, color: "#16a34a", bg: "#e7f8ef", count: 32, pct: "13.2%", signals: "1,124", vol: 1124, companies: "6.4K", score: 82 },
  { name: "Partnership & Alliances", desc: "Strategic partnerships, alliances, and collaborations.", icon: Heart, color: "#ec4899", bg: "#fdeaf4", count: 28, pct: "11.6%", signals: "987", vol: 987, companies: "5.6K", score: 81 },
  { name: "Marketing & Campaigns", desc: "Monitor marketing campaigns, brand initiatives, and events.", icon: Megaphone, color: "#f59e0b", bg: "#fff7e6", count: 24, pct: "9.9%", signals: "863", vol: 863, companies: "4.9K", score: 79 },
  { name: "Financial Performance", desc: "Track financial results, revenue growth, and key metrics.", icon: LineChart, color: "#06b6d4", bg: "#e6fafd", count: 18, pct: "7.4%", signals: "654", vol: 654, companies: "3.7K", score: 78 },
  { name: "Regulatory & Compliance", desc: "Monitor compliance changes, regulatory updates, and filings.", icon: ShieldCheck, color: "#8b5cf6", bg: "#f1ecff", count: 14, pct: "5.8%", signals: "432", vol: 432, companies: "2.8K", score: 77 },
  { name: "Market & Industry", desc: "Industry trends, market shifts, and competitive moves.", icon: Globe, color: "#f43f5e", bg: "#ffe9ee", count: 12, pct: "5.0%", signals: "387", vol: 387, companies: "2.4K", score: 77 },
  { name: "Other Events", desc: "Miscellaneous events and custom trigger categories.", icon: Settings, color: "#94a3b8", bg: "#f1f5f9", count: 10, pct: "4.1%", signals: "298", vol: 298, companies: "1.9K", score: 74 },
];

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function LibraryHeader() {
  return (
    <div>
      <nav className="flex flex-wrap items-center gap-[8px] text-[13px] text-[#64748b]">
        <a className="no-underline hover:text-[#334155]" href="/dashboard">
          Trigger Intelligence
        </a>
        <ChevronRight className="size-[14px] text-[#cbd5e1]" />
        <span className="font-semibold text-[#0f172a]">Trigger Library</span>
      </nav>

      <div className="mt-[12px] flex flex-col gap-[16px] xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="m-0 text-[26px] font-bold text-[#0f172a]">Trigger Library</h1>
          <p className="m-0 mt-[6px] text-[15px] text-[#64748b]">
            Organize and explore triggers to discover high-impact opportunities.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-[12px]">
          <div className="relative w-[240px]">
            <Search className="pointer-events-none absolute left-[14px] top-1/2 size-[16px] -translate-y-1/2 text-[#94a3b8]" />
            <input
              className="h-[44px] w-full rounded-[10px] border border-[#e9edf5] bg-white pl-[40px] pr-[14px] text-[14px] text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
              placeholder="Search signals..."
              type="search"
            />
          </div>
          <button
            className="flex h-[44px] items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] text-[14px] font-semibold text-[#334155]"
            type="button"
          >
            <Filter className="size-[16px] text-[#64748b]" />
            Filters
          </button>
          <button
            className="flex h-[44px] items-center gap-[8px] rounded-[10px] bg-[#fa5a1e] px-[18px] text-[14px] font-semibold text-white shadow-[0px_10px_20px_-6px_rgba(250,90,30,0.5)]"
            type="button"
          >
            <Plus className="size-[17px]" />
            Create Trigger
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Summary stat cards                                                  */
/* ------------------------------------------------------------------ */

const summary = [
  { icon: LayoutGrid, bg: "#f3e9ff", color: "#7c3aed", value: "10", label: "Categories", sub: "Total signal categories" },
  { icon: Activity, bg: "#e7f8ef", color: "#16a34a", value: "242", label: "Signals", sub: "Across all categories" },
  { icon: Building2, bg: "#e6f0ff", color: "#2563eb", value: "18.6K", label: "Companies Impacted", sub: "Last 30 days" },
  { icon: Settings, bg: "#fff1e3", color: "#f97316", value: "94.2%", label: "Avg. Accuracy", sub: "Across all categories" },
];

function SummaryCards() {
  return (
    <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 xl:grid-cols-4">
      {summary.map((s) => {
        const Icon = s.icon;
        return (
          <div
            className="flex items-start gap-[16px] rounded-[16px] border border-[#eef1f6] bg-white p-[18px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]"
            key={s.label}
          >
            <span
              className="flex size-[52px] shrink-0 items-center justify-center rounded-[12px]"
              style={{ backgroundColor: s.bg, color: s.color }}
            >
              <Icon className="size-[24px]" />
            </span>
            <div>
              <p className="m-0 text-[26px] font-bold leading-none text-[#0f172a]">
                {s.value}
              </p>
              <p className="m-0 mt-[6px] text-[15px] font-semibold text-[#334155]">
                {s.label}
              </p>
              <p className="m-0 mt-[3px] text-[12px] text-[#94a3b8]">{s.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Category cards                                                      */
/* ------------------------------------------------------------------ */

function CategoryCard({ category }: { category: Category }) {
  const Icon = category.icon;
  return (
    <div
      className="flex cursor-pointer flex-col rounded-[16px] border border-[#eef1f6] bg-white p-[16px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)] transition hover:border-[#d7dcff] hover:shadow-[0px_8px_20px_-8px_rgba(91,61,245,0.25)]"
      onClick={() => {
        window.location.href = "/trigger-details";
      }}
      role="button"
      tabIndex={0}
    >
      <span
        className="flex size-[48px] items-center justify-center rounded-[12px]"
        style={{ backgroundColor: category.bg, color: category.color }}
      >
        <Icon className="size-[24px]" />
      </span>
      <h3 className="m-0 mt-[14px] text-[15px] font-bold text-[#0f172a]">
        {category.name}
      </h3>
      <p className="m-0 mt-[6px] text-[12px] leading-[18px] text-[#64748b]">
        {category.desc}
      </p>
      <span
        className="mt-[12px] inline-flex w-fit items-center rounded-[7px] px-[10px] py-[4px] text-[12px] font-semibold"
        style={{ backgroundColor: category.bg, color: category.color }}
      >
        {category.count} Signals
      </span>

      <div className="mt-[12px] grid grid-cols-3 gap-[6px] border-t border-[#f1f5f9] pt-[10px]">
        {[
          ["Signals (30D)", category.signals],
          ["Companies", category.companies],
          ["Avg. Score", String(category.score)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="m-0 min-h-[20px] text-[8px] font-medium uppercase leading-[10px] tracking-[0.01em] text-[#94a3b8]">
              {label}
            </p>
            <p className="m-0 mt-[2px] text-[13px] font-bold text-[#0f172a]">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryGrid() {
  return (
    <div className="grid grid-cols-2 gap-[16px] md:grid-cols-3 xl:grid-cols-5">
      {categories.map((c) => (
        <CategoryCard category={c} key={c.name} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Category Distribution Overview                                      */
/* ------------------------------------------------------------------ */

function DistributionOverview() {
  const legendLeft = categories.slice(0, 5);
  const legendRight = categories.slice(5);

  const LegendRow = ({ c }: { c: Category }) => (
    <div className="flex items-center justify-between gap-[10px]">
      <span className="flex min-w-0 items-center gap-[10px]">
        <span className="size-[10px] shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
        <span className="truncate text-[13px] font-medium text-[#334155]">{c.name}</span>
      </span>
      <span className="whitespace-nowrap text-[13px] text-[#94a3b8]">
        <span className="font-semibold text-[#0f172a]">{c.count}</span> ({c.pct})
      </span>
    </div>
  );

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[18px] font-bold text-[#0f172a]">
        Category Distribution Overview
      </h2>

      <div className="mt-[18px] flex flex-col items-center gap-[28px] lg:flex-row">
        <div className="relative size-[190px] shrink-0">
          <Donut
            segments={categories.map((c) => ({ value: c.count, color: c.color }))}
            size={190}
            thickness={26}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[26px] font-bold leading-none text-[#0f172a]">242</span>
            <span className="mt-[4px] text-[12px] text-[#64748b]">Total Signals</span>
          </div>
        </div>

        <div className="grid w-full flex-1 grid-cols-1 gap-x-[40px] gap-y-[12px] md:grid-cols-2">
          <div className="flex flex-col gap-[12px]">
            {legendLeft.map((c) => (
              <LegendRow c={c} key={c.name} />
            ))}
          </div>
          <div className="flex flex-col gap-[12px]">
            {legendRight.map((c) => (
              <LegendRow c={c} key={c.name} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Right rail                                                          */
/* ------------------------------------------------------------------ */

const perfColumns = "grid-cols-[minmax(0,1.5fr)_0.7fr_0.8fr_0.7fr]";

function CategoryPerformanceCard() {
  const rows = categories.slice(0, 5);
  const maxVol = Math.max(...rows.map((r) => r.vol));

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">
          Category Performance (30 Days)
        </h2>
        <button className="text-[12px] font-semibold text-[#5b3df5]" type="button">
          View Analytics
        </button>
      </div>

      <div className={cn("mt-[16px] grid gap-[8px] pb-[8px] text-[10px] font-semibold uppercase tracking-[0.02em] text-[#94a3b8]", perfColumns)}>
        <span>Category</span>
        <span className="text-right">Signals</span>
        <span className="text-right">Companies</span>
        <span className="text-right">Avg. Score</span>
      </div>

      <div className="flex flex-col gap-[14px]">
        {rows.map((r) => (
          <div className={cn("grid items-center gap-[8px]", perfColumns)} key={r.name}>
            <div className="min-w-0">
              <p className="m-0 truncate text-[12px] font-semibold text-[#0f172a]">
                {r.name}
              </p>
              <span className="mt-[5px] block h-[3px] rounded-full" style={{ width: `${(r.vol / maxVol) * 100}%`, backgroundColor: r.color }} />
            </div>
            <span className="text-right text-[12px] font-semibold text-[#0f172a]">{r.signals}</span>
            <span className="text-right text-[12px] text-[#64748b]">{r.companies}</span>
            <span className="text-right text-[12px] font-semibold text-[#0f172a]">{r.score}</span>
          </div>
        ))}
      </div>

      <button className="mt-[18px] flex w-full items-center justify-center gap-[6px] text-[13px] font-semibold text-[#5b3df5]" type="button">
        View All Categories
        <ArrowRight className="size-[15px]" />
      </button>
    </section>
  );
}

function AIInsightsCard() {
  const bullets = [
    "Funding & Investment triggers have the highest intent score (87 avg).",
    "Product & Innovation shows strong growth potential (+24% vs last 30 days).",
    "Consider creating custom triggers for your industry-specific use cases.",
  ];

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 flex items-center gap-[8px] text-[15px] font-bold text-[#0f172a]">
        AI Category Insights
        <span className="rounded-[6px] bg-[#f3e9ff] px-[7px] py-[2px] text-[11px] font-semibold text-[#7c3aed]">
          AI
        </span>
      </h2>

      <div className="relative mt-[14px] overflow-hidden rounded-[12px] bg-gradient-to-br from-[#f5f3ff] to-[#ede9fe] p-[16px]">
        <span className="absolute right-[14px] top-[14px] flex size-[38px] items-center justify-center rounded-full bg-gradient-to-br from-[#7c3aed] to-[#5b3df5] text-white">
          <TrendingUp className="size-[19px]" />
        </span>
        <p className="m-0 pr-[46px] text-[14px] font-bold text-[#0f172a]">
          Top Performing Category
        </p>
        <p className="m-0 mt-[6px] text-[13px] leading-[19px] text-[#475569]">
          Hiring & Talent shows the highest signal volume with 1,846 signals in the last
          30 days.
        </p>
      </div>

      <div className="mt-[16px] flex flex-col gap-[12px]">
        {bullets.map((b) => (
          <div className="flex gap-[10px]" key={b}>
            <span className="mt-[1px] flex size-[18px] shrink-0 items-center justify-center rounded-[6px] bg-[#eef1ff] text-[#5b3df5]">
              <Plus className="size-[12px]" />
            </span>
            <p className="m-0 text-[13px] leading-[19px] text-[#475569]">{b}</p>
          </div>
        ))}
      </div>

      <button className="mt-[18px] flex w-full items-center justify-center gap-[8px] rounded-[10px] border border-[#e0dcff] bg-white py-[10px] text-[13px] font-semibold text-[#5b3df5]" type="button">
        View AI Recommendations
        <ArrowRight className="size-[15px]" />
      </button>
    </section>
  );
}

function QuickActionsCard() {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">Quick Actions</h2>
      <button className="mt-[14px] flex w-full items-center gap-[12px] rounded-[12px] border border-[#eef1f6] p-[12px] text-left transition hover:bg-[#f8fafc]" type="button">
        <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#eef1ff] text-[#5b3df5]">
          <Download className="size-[18px]" />
        </span>
        <span>
          <span className="block text-[14px] font-semibold text-[#0f172a]">
            Import Triggers
          </span>
          <span className="block text-[12px] text-[#94a3b8]">
            Import triggers from templates
          </span>
        </span>
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function TriggerLibraryPage() {
  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Trigger Intelligence" activeSub="Trigger Library" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar searchPlaceholder="Search companies, triggers, executives..." />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          <LibraryHeader />

          <div className="mt-[22px] grid grid-cols-1 gap-[24px] xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-[20px]">
              <SummaryCards />
              <CategoryGrid />
              <DistributionOverview />
            </div>

            <div className="flex flex-col gap-[20px]">
              <CategoryPerformanceCard />
              <AIInsightsCard />
              <QuickActionsCard />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
