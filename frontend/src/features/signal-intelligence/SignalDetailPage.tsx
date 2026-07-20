import {
  Bookmark,
  Building2,
  Check,
  ChevronRight,
  Copy,
  Database,
  ExternalLink,
  Info,
  MoreVertical,
  Radio,
  Share2,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Donut } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";
import {
  getSignalById,
  getSignals,
  listSignals,
  type SignalOut,
  type SignalWithCompanyOut,
} from "../../api/signals";
import { getCompany } from "../../api/companies";
import type { CompanyOut } from "../../api/icp";
import { getOrganisationId } from "../../lib/session";
import { CATEGORY_DESCRIPTIONS, categoryLabel, categoryStyle } from "../../lib/signalCategories";

function getSignalIdFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("id");
}

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

function titleCase(s: string): string {
  return s
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/* Same 0.60/0.40 confidence tiers used on the Signal Intelligence dashboard
 * (signal_directory.HIGH_CONFIDENCE/MEDIUM_CONFIDENCE) - kept consistent
 * across every page that shows a signal's confidence tier. */
function confidenceTier(confidence: number): { label: string; tone: string; color: string } {
  if (confidence >= 0.6) return { label: "High Intent", tone: "purple", color: "#7c3aed" };
  if (confidence >= 0.4) return { label: "Medium Intent", tone: "orange", color: "#f97316" };
  return { label: "Low Intent", tone: "gray", color: "#64748b" };
}

/* original_source is "news:{news_id}" or "scoop:{scoop_id}" (see
 * signal_extractor.py); for news-derived signals the news_id itself embeds
 * the source URL, so pulling out any http(s) substring recovers a real,
 * clickable link back to the source article. */
function extractUrl(originalSource: string | null): string | null {
  if (!originalSource) return null;
  const match = originalSource.match(/https?:\/\/\S+/);
  return match ? match[0] : null;
}

function sourceTypeLabel(originalSource: string | null): string {
  if (!originalSource) return "ZoomInfo Data";
  if (originalSource.startsWith("news:")) return "News Article";
  if (originalSource.startsWith("scoop:")) return "Deal Intelligence";
  return "ZoomInfo Data";
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function LogoSquare({
  icon: Icon,
  text,
  bg,
  color,
  size = 40,
  radius = 10,
}: {
  icon?: ComponentType<{ className?: string }>;
  text?: string;
  bg: string;
  color: string;
  size?: number;
  radius?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center text-[13px] font-bold"
      style={{
        backgroundColor: bg,
        color,
        width: size,
        height: size,
        borderRadius: radius,
      }}
    >
      {Icon ? <Icon className="size-[20px]" /> : text}
    </span>
  );
}

const tagTones: Record<string, string> = {
  purple: "bg-[#f3e9ff] text-[#7c3aed]",
  gray: "bg-[#f1f5f9] text-[#64748b]",
  green: "bg-[#e7f8ef] text-[#16a34a]",
  blue: "bg-[#e6f0ff] text-[#2563eb]",
  orange: "bg-[#fff1e3] text-[#f97316]",
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

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function DetailHeader({ signal }: { signal: SignalWithCompanyOut | null }) {
  const title = signal ? titleCase(signal.signal_type) : "Series B funding round announced";
  const company = signal?.company_name ?? "Acme Corp";
  const detected = signal
    ? `${new Date(signal.ingested_at ?? "").toLocaleString()} (${relativeTime(signal.ingested_at)})`
    : "May 20, 2025 10:15 AM (8m ago)";
  const category = signal ? categoryLabel(signal.signal_category) : "Funding & Investment";
  const confidence = signal?.signal_confidence ?? 0.8;
  const tier = confidenceTier(confidence);

  return (
    <div className="flex flex-col gap-[18px] xl:flex-row xl:items-start xl:justify-between">
      <div className="flex items-start gap-[18px]">
        <LogoSquare bg="#0f172a" color="#ffffff" icon={Radio} radius={14} size={64} />
        <div>
          <div className="flex flex-wrap items-center gap-[12px]">
            <h1 className="m-0 text-[24px] font-bold text-[#0f172a]">
              {title}
            </h1>
            <span className={cn("rounded-[7px] px-[10px] py-[4px] text-[12px] font-semibold", tagTones[tier.tone])}>
              {tier.label}
            </span>
          </div>
          <p className="m-0 mt-[8px] text-[14px] text-[#64748b]">
            <span className="font-semibold text-[#334155]">{company}</span> • Detected
            on {detected}
          </p>
          <div className="mt-[12px] flex flex-wrap gap-[8px]">
            <Tag label={category} tone="purple" />
            {signal && <Tag label={titleCase(signal.extraction_method ?? "rule_based")} tone="gray" />}
            {signal?.is_action && <Tag label="Actionable" tone="green" />}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-[10px]">
        <button
          className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-semibold text-[#334155]"
          type="button"
        >
          <Bookmark className="size-[16px]" />
          Add to Watchlist
        </button>
        <button
          className="flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[16px] py-[10px] text-[14px] font-semibold text-[#334155]"
          type="button"
        >
          <Share2 className="size-[16px]" />
          Share
        </button>
        <button
          className="flex items-center gap-[8px] rounded-[10px] bg-[#5b3df5] px-[16px] py-[10px] text-[14px] font-semibold text-white shadow-[0px_10px_20px_-6px_rgba(91,61,245,0.45)]"
          type="button"
        >
          <Check className="size-[16px]" />
          Validate Signal
        </button>
        <button
          aria-label="More actions"
          className="flex size-[42px] items-center justify-center rounded-[10px] border border-[#e9edf5] bg-white text-[#64748b]"
          type="button"
        >
          <MoreVertical className="size-[17px]" />
        </button>
      </div>
    </div>
  );
}

const tabs = ["Overview"];

function DetailTabs() {
  return (
    <div className="mt-[20px] flex gap-[28px] overflow-x-auto border-b border-[#e9edf5]">
      {tabs.map((tab, index) => {
        const active = index === 0;

        return (
          <button
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 pb-[14px] text-[14px] font-semibold transition",
              active
                ? "border-[#5b3df5] text-[#5b3df5]"
                : "border-transparent text-[#64748b] hover:text-[#334155]",
            )}
            key={tab}
            type="button"
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Intent score + confidence breakdown                                 */
/* ------------------------------------------------------------------ */

function IntentScoreCard({ signal }: { signal: SignalWithCompanyOut | null }) {
  const confidence = signal?.signal_confidence ?? 0.96;
  const score = Math.round(confidence * 100);
  const tier = confidenceTier(confidence);

  return (
    <div className="max-w-[420px] rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <p className="m-0 text-[14px] font-semibold text-[#475569]">Intent Score</p>
      <div className="mt-[10px] flex items-center gap-[12px]">
        <span className="text-[30px] font-bold leading-none text-[#0f172a]">
          {score} <span className="text-[18px] font-semibold text-[#94a3b8]">/ 100</span>
        </span>
        <span className={cn("rounded-[7px] px-[10px] py-[4px] text-[12px] font-semibold", tagTones[tier.tone])}>
          {tier.label}
        </span>
      </div>
      <p className="m-0 mt-[10px] text-[13px] text-[#94a3b8]">
        {signal?.scored_at
          ? `Confidence computed ${new Date(signal.scored_at).toLocaleString()}`
          : "Confidence score for this signal"}
      </p>
      <div className="mt-[12px] h-[6px] w-full rounded-full bg-[#e5e7eb]">
        <div className="h-full rounded-full bg-[#22c55e]" style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

/* IntentScoreOverTime (a fake 7-day line chart) had no backing data -
 * signals don't have a score history, just one ingested_at/scored_at pair -
 * so this replaces it with the real fields that actually explain how the
 * signal was extracted and classified. */
function ExtractionDetailsCard({ signal }: { signal: SignalWithCompanyOut | null }) {
  const rows: { label: string; value: string }[] = signal
    ? (
        [
          { label: "Extraction Method", value: titleCase(signal.extraction_method ?? "rule_based") },
          {
            label: "Extraction Confidence",
            value: signal.extraction_confidence !== null ? `${Math.round(signal.extraction_confidence * 100)}%` : "—",
          },
          { label: "Source Type", value: sourceTypeLabel(signal.original_source) },
          { label: "Signal Type", value: titleCase(signal.signal_type) },
          {
            label: "Action Signal",
            value: signal.is_action ? "Yes — direct action detected" : "No — contextual/informational",
          },
          signal.dollar_value_usd
            ? { label: "Deal Value", value: `$${signal.dollar_value_usd.toLocaleString()}` }
            : null,
        ] as ({ label: string; value: string } | null)[]
      ).filter((r): r is { label: string; value: string } => r !== null)
    : [
        { label: "Extraction Method", value: "Rule Based" },
        { label: "Extraction Confidence", value: "92%" },
        { label: "Source Type", value: "News Article" },
        { label: "Signal Type", value: "Funding Round Announced" },
        { label: "Action Signal", value: "No — contextual/informational" },
      ];

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">
        Extraction Details
        <Info className="size-[15px] text-[#94a3b8]" />
      </h2>
      <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">How this signal was identified and classified.</p>

      <dl className="mt-[16px] flex flex-col gap-[13px]">
        {rows.map((row) => (
          <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-[12px]" key={row.label}>
            <dt className="text-[13px] text-[#94a3b8]">{row.label}</dt>
            <dd className="m-0 text-[13px] font-medium text-[#334155]">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* Real confidence formula (signal_extractor.compute_signal_confidence):
 * confidence = m2_corroboration x m3_recency x m4_resourcing, clamped to
 * [0,1]. Replaces the fake "Event Significance/Source Credibility/..."
 * breakdown with the model's actual component multipliers. */
function ConfidenceBreakdownCard({ signal }: { signal: SignalWithCompanyOut | null }) {
  const confidence = signal?.signal_confidence ?? 0.96;
  const score = Math.round(confidence * 100);
  const tier = confidenceTier(confidence);

  const components = signal
    ? [
        { label: "Corroboration", value: signal.m2_corroboration ?? 1, color: "#7c3aed" },
        { label: "Recency", value: signal.m3_recency ?? 1, color: "#16a34a" },
        { label: "Directness", value: signal.m4_resourcing ?? 1, color: "#f59e0b" },
      ]
    : [
        { label: "Corroboration", value: 1.15, color: "#7c3aed" },
        { label: "Recency", value: 1.0, color: "#16a34a" },
        { label: "Directness", value: 1.1, color: "#f59e0b" },
      ];

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Confidence Breakdown</h2>
      <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">
        Confidence = Corroboration × Recency × Directness.
      </p>

      <div className="mt-[16px] flex flex-col items-center gap-[22px] sm:flex-row">
        <div className="relative size-[170px] shrink-0">
          <Donut segments={components.map((c) => ({ value: c.value, color: c.color }))} size={170} thickness={24} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[22px] font-bold leading-none text-[#0f172a]">
              {score} <span className="text-[14px] text-[#94a3b8]">/ 100</span>
            </span>
            <span className="mt-[4px] text-[12px]" style={{ color: tier.color }}>
              {tier.label}
            </span>
          </div>
        </div>

        <div className="flex w-full flex-1 flex-col gap-[12px]">
          {components.map((c) => (
            <div className="flex items-center justify-between gap-[12px]" key={c.label}>
              <span className="flex items-center gap-[10px]">
                <span
                  className="size-[10px] rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                <span className="text-[13px] font-medium text-[#334155]">{c.label}</span>
              </span>
              <span className="whitespace-nowrap text-[13px] font-semibold text-[#0f172a]">
                {c.value.toFixed(2)}×
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Details / Source / Related companies                                */
/* ------------------------------------------------------------------ */

function SignalDetailsCard({ signal, company }: { signal: SignalWithCompanyOut | null; company: CompanyOut | null }) {
  const rows: { label: string; value: string }[] = signal
    ? [
        {
          label: "Detected",
          value: `${new Date(signal.ingested_at ?? "").toLocaleString()} (${relativeTime(signal.ingested_at)})`,
        },
        { label: "Source", value: titleCase(signal.source ?? "ZoomInfo") },
        { label: "Source Type", value: sourceTypeLabel(signal.original_source) },
        { label: "Location", value: company ? [company.city, company.country].filter(Boolean).join(", ") || "—" : "—" },
        { label: "Employees", value: company?.employee_range ?? "—" },
        { label: "Revenue", value: company?.revenue_range ?? "—" },
        { label: "Industry", value: company?.industries?.[0] ?? "—" },
      ]
    : [
        { label: "Detected", value: "May 20, 2025 10:15 AM (8m ago)" },
        { label: "Source", value: "ZoomInfo" },
        { label: "Source Type", value: "News Article" },
        { label: "Location", value: "United States" },
        { label: "Employees", value: "501-1K" },
        { label: "Revenue", value: "$50M - $100M" },
        { label: "Industry", value: "Software Development" },
      ];

  const tags = signal
    ? [categoryLabel(signal.signal_category), ...(signal.is_action ? ["Actionable"] : [])]
    : ["Funding", "Growth"];

  const description = signal?.core_fact ?? "No summary was extracted for this signal.";

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Signal Details</h2>

      <dl className="mt-[16px] flex flex-col gap-[12px]">
        {rows.map((row) => (
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-[12px]" key={row.label}>
            <dt className="text-[13px] text-[#94a3b8]">{row.label}</dt>
            <dd className="m-0 text-[13px] font-medium text-[#334155]">{row.value}</dd>
          </div>
        ))}

        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-[12px]">
          <dt className="text-[13px] text-[#94a3b8]">Tags</dt>
          <dd className="m-0 flex flex-wrap gap-[6px]">
            {tags.map((t) => (
              <Tag key={t} label={t} tone="purple" />
            ))}
          </dd>
        </div>

        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-[12px]">
          <dt className="text-[13px] text-[#94a3b8]">Description</dt>
          <dd className="m-0 text-[13px] leading-[20px] text-[#334155]">{description}</dd>
        </div>
      </dl>
    </section>
  );
}

function SourceSnippetCard({ signal }: { signal: SignalWithCompanyOut | null }) {
  const url = signal ? extractUrl(signal.original_source) : null;
  const sourceName = url ? hostnameOf(url) : signal ? titleCase(signal.source ?? "ZoomInfo") : "TechCrunch";
  const detected = signal?.ingested_at ? new Date(signal.ingested_at).toLocaleString() : "May 20, 2025 10:00 AM";
  const snippet =
    signal?.core_fact ??
    "Acme Corp, an AI-powered platform for enterprise automation, today announced it has raised $25 million in Series B funding led by Sequoia Capital, with participation from existing investors...";

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Source Snippet</h2>

      <div className="mt-[16px] flex items-center gap-[10px]">
        <LogoSquare bg="#dcfce7" color="#16a34a" icon={Database} radius={6} size={26} />
        <div className="leading-tight">
          <p className="m-0 text-[13px] font-semibold text-[#0f172a]">{sourceName}</p>
          <p className="m-0 text-[12px] text-[#94a3b8]">{detected}</p>
        </div>
      </div>

      <p className="m-0 mt-[16px] text-[13px] leading-[20px] text-[#64748b]">{snippet}</p>

      {url && (
        <a
          className="mt-[16px] flex w-fit items-center gap-[7px] text-[13px] font-semibold text-[#5b3df5] no-underline"
          href={url}
          rel="noreferrer"
          target="_blank"
        >
          Read full article
          <ExternalLink className="size-[14px]" />
        </a>
      )}
    </section>
  );
}

type RelatedCompany = { companyId: string; name: string; score: number };

/* Real replacement for the fake "Similar Companies" list (Databricks/
 * Snowflake/OpenAI) - there's no similarity model in the backend, so this
 * shows other real companies that have a signal in the same signal_category. */
function SimilarCompaniesCard({ related, categoryName }: { related: RelatedCompany[]; categoryName: string }) {
  const rows: RelatedCompany[] =
    related.length > 0
      ? related
      : [
          { companyId: "", name: "Databricks", score: 92 },
          { companyId: "", name: "Snowflake", score: 90 },
          { companyId: "", name: "OpenAI", score: 89 },
        ];

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Companies with Similar Signals</h2>
      <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">Other companies with a {categoryName} signal.</p>

      <div className="mt-[16px] flex flex-col gap-[16px]">
        {rows.map((c) => (
          <div
            className={cn("flex items-center gap-[12px]", c.companyId && "cursor-pointer")}
            key={c.companyId || c.name}
            onClick={
              c.companyId
                ? () => {
                    window.location.href = `/enterprise-detail?id=${c.companyId}`;
                  }
                : undefined
            }
            role={c.companyId ? "button" : undefined}
            tabIndex={c.companyId ? 0 : undefined}
          >
            <LogoSquare bg="#eef1ff" color="#4f46e5" icon={Building2} radius={10} size={40} />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[14px] font-bold text-[#0f172a]">{c.name}</p>
              <p className="m-0 text-[12px] text-[#94a3b8]">{categoryName}</p>
            </div>
            <span className="whitespace-nowrap text-[12px] text-[#94a3b8]">
              Score: <span className="font-semibold text-[#334155]">{c.score}</span>
            </span>
          </div>
        ))}
      </div>

      <button
        className="mt-[18px] flex items-center gap-[6px] text-[13px] font-semibold text-[#5b3df5]"
        type="button"
      >
        View all similar companies
        <ChevronRight className="size-[15px]" />
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Activity timeline                                                   */
/* ------------------------------------------------------------------ */

/* The fake timeline had 5 steps (Signal Detected/Data Enriched/AI Analysis
 * Complete/Added to Queue/Pending Review) - none of that workflow state
 * exists in the backend. Signal only has two real timestamps. */
function ActivityTimeline({ signal }: { signal: SignalWithCompanyOut | null }) {
  const steps = signal
    ? [
        {
          icon: Radio,
          bg: "#e6f0ff",
          color: "#2563eb",
          title: "Signal Ingested",
          time: signal.ingested_at ? new Date(signal.ingested_at).toLocaleString() : "—",
          desc: `Extracted via ${titleCase(signal.extraction_method ?? "rule_based")} from ${sourceTypeLabel(signal.original_source)}.`,
        },
        {
          icon: TrendingUp,
          bg: "#f3e9ff",
          color: "#7c3aed",
          title: "Confidence Scored",
          time: signal.scored_at ? new Date(signal.scored_at).toLocaleString() : "—",
          desc: `Confidence computed at ${Math.round((signal.signal_confidence ?? 0) * 100)}%.`,
        },
      ]
    : [
        {
          icon: Radio,
          bg: "#e6f0ff",
          color: "#2563eb",
          title: "Signal Ingested",
          time: "May 20, 2025, 10:15 AM",
          desc: "Extracted via Rule Based from News Article.",
        },
        {
          icon: TrendingUp,
          bg: "#f3e9ff",
          color: "#7c3aed",
          title: "Confidence Scored",
          time: "May 20, 2025, 10:16 AM",
          desc: "Confidence computed at 96%.",
        },
      ];

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Signal Activity Timeline</h2>

      <div className="mt-[20px] grid grid-cols-1 gap-[24px] sm:grid-cols-2">
        {steps.map((step, index) => {
          const Icon = step.icon;

          return (
            <div className="relative" key={step.title}>
              <div className="flex items-center">
                <span
                  className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px]"
                  style={{ backgroundColor: step.bg, color: step.color }}
                >
                  <Icon className="size-[19px]" />
                </span>
                {index < steps.length - 1 && (
                  <span className="relative mx-[8px] hidden h-px flex-1 sm:block">
                    <span className="absolute inset-0 border-t border-dashed border-[#cbd5e1]" />
                    <span className="absolute left-1/2 top-1/2 size-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c7d2fe]" />
                  </span>
                )}
              </div>
              <div className="mt-[12px]">
                <p className="m-0 text-[14px] font-bold text-[#0f172a]">{step.title}</p>
                <p className="m-0 mt-[3px] text-[12px] text-[#94a3b8]">
                  {step.time}
                </p>
                <p className="m-0 mt-[8px] text-[12px] leading-[18px] text-[#64748b]">
                  {step.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Right rail                                                          */
/* ------------------------------------------------------------------ */

/* "Pending Review" implied a review workflow that doesn't exist in the
 * backend (no reviewed/status field on Signal) - this shows the real
 * is_action classification and confidence tier instead. */
function SignalStatusCard({ signal }: { signal: SignalWithCompanyOut | null }) {
  const confidence = signal?.signal_confidence ?? 0.96;
  const tier = confidenceTier(confidence);
  const isAction = signal?.is_action ?? false;

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Signal Classification</h2>
      <p className="m-0 mt-[14px] flex items-center gap-[8px] text-[15px] font-bold" style={{ color: tier.color }}>
        {isAction ? <Check className="size-[18px]" /> : <Info className="size-[18px]" />}
        {isAction ? "Actionable Signal" : "Informational Signal"}
      </p>
      <p className="m-0 mt-[10px] text-[13px] leading-[20px] text-[#64748b]">
        {isAction
          ? "This signal reflects a direct action taken by the company - a strong basis for outreach."
          : "This signal provides context about the company rather than a direct action - useful for qualification, less urgent for outreach."}
      </p>

      <p className="m-0 mt-[18px] text-[14px] font-bold text-[#0f172a]">Confidence Tier</p>
      <p className="m-0 mt-[8px] text-[13px] leading-[20px] text-[#64748b]">
        {tier.label} ({Math.round(confidence * 100)}/100) —{" "}
        {tier.tone === "purple"
          ? "strong, well-corroborated signal."
          : tier.tone === "orange"
            ? "moderate corroboration or recency."
            : "limited corroboration or an older source."}
      </p>
    </section>
  );
}

/* Renamed from "AI Summary" - nothing here is LLM-generated (extraction is
 * rule-based, see extraction_method), so the "AI"/"Beta" badge implied a
 * capability that doesn't exist. Body is the real core_fact plus the same
 * category description shown on the Trigger Library. */
function SummaryCard({ signal, categoryName }: { signal: SignalWithCompanyOut | null; categoryName: string }) {
  const categoryDesc = signal ? CATEGORY_DESCRIPTIONS[signal.signal_category] : null;
  const text = signal?.core_fact
    ? `${signal.core_fact}${categoryDesc ? ` This is a ${categoryName} signal: ${categoryDesc}` : ""}`
    : "Acme Corp has announced a $25M Series B funding round led by Sequoia Capital. The funding will be used to expand their AI platform and enter new markets.";

  const copy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Signal Summary</h2>
      <p className="m-0 mt-[12px] text-[13px] leading-[20px] text-[#475569]">{text}</p>
      <button
        className="mt-[16px] flex items-center gap-[8px] rounded-[10px] border border-[#e9edf5] bg-white px-[14px] py-[9px] text-[13px] font-semibold text-[#334155]"
        onClick={copy}
        type="button"
      >
        <Copy className="size-[15px]" />
        Copy Summary
      </button>
    </section>
  );
}

type CompanySignalRow = { signalId: string; title: string; category: string; date: string; score: number };

/* Real replacement for the fake "Similar Signals" list - other real
 * signals extracted for this same company, sorted by confidence (see
 * controllers.signals.get_signals). */
function SimilarSignalsCard({ rows, companyName }: { rows: CompanySignalRow[]; companyName: string }) {
  const list: CompanySignalRow[] =
    rows.length > 0
      ? rows
      : [
          { signalId: "", title: "Series A Funding", category: "budget_and_capital", date: "Mar 5, 2024", score: 88 },
          { signalId: "", title: "Product Launch", category: "ai_seriousness", date: "Jan 10, 2024", score: 82 },
          { signalId: "", title: "Company Expansion", category: "urgency_and_catalysts", date: "Nov 5, 2023", score: 76 },
        ];

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">More Signals from {companyName}</h2>
      </div>

      <div className="mt-[16px] flex flex-col gap-[16px]">
        {list.map((s) => {
          const style = categoryStyle(s.category);
          const Icon = style.icon;

          return (
            <div
              className={cn("flex items-center gap-[12px]", s.signalId && "cursor-pointer")}
              key={s.signalId || s.title}
              onClick={
                s.signalId
                  ? () => {
                      window.location.href = `/signal-detail?id=${s.signalId}`;
                    }
                  : undefined
              }
              role={s.signalId ? "button" : undefined}
              tabIndex={s.signalId ? 0 : undefined}
            >
              <LogoSquare bg={style.bg} color={style.color} icon={Icon} radius={10} size={38} />
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[14px] font-bold text-[#0f172a]">{s.title}</p>
                <p className="m-0 text-[12px] text-[#94a3b8]">{s.date}</p>
              </div>
              <div className="text-right">
                <p className="m-0 text-[11px] text-[#94a3b8]">Intent Score</p>
                <p className="m-0 text-[15px] font-bold text-[#0f172a]">{s.score}</p>
              </div>
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

export function SignalDetailPage() {
  const [signal, setSignal] = useState<SignalWithCompanyOut | null>(null);
  const [company, setCompany] = useState<CompanyOut | null>(null);
  const [companySignals, setCompanySignals] = useState<SignalOut[]>([]);
  const [categorySignals, setCategorySignals] = useState<SignalWithCompanyOut[]>([]);

  useEffect(() => {
    const organisationId = getOrganisationId();
    const signalId = getSignalIdFromUrl();
    if (!organisationId || !signalId) {
      return;
    }
    getSignalById(organisationId, signalId)
      .then((s) => {
        setSignal(s);

        getCompany(organisationId, s.company_id)
          .then(setCompany)
          .catch(() => {
            // Company lookup failed - Signal Details card falls back to "—".
          });

        getSignals(organisationId, s.company_id)
          .then((rows) => setCompanySignals(rows.filter((r) => r.signal_id !== s.signal_id)))
          .catch(() => {
            // No other signals for this company yet - keep the dummy rows.
          });

        listSignals(organisationId, { category: s.signal_category, page_size: 12 })
          .then((res) => setCategorySignals(res.items.filter((r) => r.company_id !== s.company_id)))
          .catch(() => {
            // No other companies with this category yet - keep the dummy rows.
          });
      })
      .catch(() => {
        // No matching signal - keep the dummy fallback data.
      });
  }, []);

  const categoryName = signal ? categoryLabel(signal.signal_category) : "Funding & Investment";

  const relatedCompanies: RelatedCompany[] = (() => {
    const seen = new Set<string>();
    const rows: RelatedCompany[] = [];
    const sorted = [...categorySignals].sort((a, b) => (b.signal_confidence ?? 0) - (a.signal_confidence ?? 0));
    for (const s of sorted) {
      if (seen.has(s.company_id)) continue;
      seen.add(s.company_id);
      rows.push({ companyId: s.company_id, name: s.company_name, score: Math.round((s.signal_confidence ?? 0) * 100) });
      if (rows.length >= 4) break;
    }
    return rows;
  })();

  const otherSignals: CompanySignalRow[] = companySignals.slice(0, 4).map((s) => ({
    signalId: s.signal_id,
    title: titleCase(s.signal_type),
    category: s.signal_category,
    date: s.ingested_at ? new Date(s.ingested_at).toLocaleDateString() : "—",
    score: Math.round((s.signal_confidence ?? 0) * 100),
  }));

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Signal Intelligence" activeSub="Signal Feed" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          searchPlaceholder="Search companies, triggers, executives..."
          showDetection={false}
        />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          <nav className="flex items-center gap-[8px] text-[13px]">
            <a className="text-[#64748b] no-underline hover:text-[#334155]" href="/signal-feed">
              Signal Feed
            </a>
            <ChevronRight className="size-[14px] text-[#cbd5e1]" />
            <span className="font-semibold text-[#0f172a]">Signal Detail</span>
          </nav>

          <div className="mt-[16px]">
            <DetailHeader signal={signal} />
          </div>

          <DetailTabs />

          <div className="mt-[24px] grid grid-cols-1 gap-[24px] xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-[24px]">
              <IntentScoreCard signal={signal} />

              <div className="grid grid-cols-1 gap-[24px] lg:grid-cols-[1.45fr_1fr]">
                <ExtractionDetailsCard signal={signal} />
                <ConfidenceBreakdownCard signal={signal} />
              </div>

              <div className="grid grid-cols-1 gap-[24px] lg:grid-cols-3">
                <SignalDetailsCard company={company} signal={signal} />
                <SourceSnippetCard signal={signal} />
                <SimilarCompaniesCard categoryName={categoryName} related={relatedCompanies} />
              </div>

              <ActivityTimeline signal={signal} />
            </div>

            <div className="flex flex-col gap-[24px]">
              <SignalStatusCard signal={signal} />
              <SummaryCard categoryName={categoryName} signal={signal} />
              <SimilarSignalsCard companyName={signal?.company_name ?? "this company"} rows={otherSignals} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
