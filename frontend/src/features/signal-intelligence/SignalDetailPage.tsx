import {
  Building2,
  ChevronRight,
  Copy,
  Database,
  ExternalLink,
  Info,
  Radio,
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

/* Signal Detail for the evidence-based pipeline (brief item 15) - backed by
 * BuyingEvent, not the legacy Signal table. "Intent"/"confidence-tier"
 * language is replaced by xsparks_relevance-based "Relevance" tiers (brief
 * item 24), and the confidence breakdown now shows the real event_score
 * multipliers (freshness/source quality/status), not the old m2/m3/m4. */

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

function formatUsd(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/* Same 0.65/0.40 relevance tiers used on the Signal Intelligence dashboard
 * (buying_event_directory.HIGH_RELEVANCE/MEDIUM_RELEVANCE). */
function relevanceTier(relevance: number): { label: string; tone: string; color: string } {
  if (relevance >= 0.65) return { label: "High Relevance", tone: "purple", color: "#7c3aed" };
  if (relevance >= 0.4) return { label: "Medium Relevance", tone: "orange", color: "#f97316" };
  return { label: "Low Relevance", tone: "gray", color: "#64748b" };
}

function isActionable(signal: { status_factor: number | null }): boolean {
  return (signal.status_factor ?? 0) >= 0.9;
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
  if (!signal) {
    return (
      <div className="flex items-start gap-[18px]">
        <LogoSquare bg="#0f172a" color="#ffffff" icon={Radio} radius={14} size={64} />
        <div>
          <h1 className="m-0 text-[24px] font-bold text-[#0f172a]">Signal</h1>
          <p className="m-0 mt-[8px] text-[14px] text-[#64748b]">Loading signal details…</p>
        </div>
      </div>
    );
  }

  const title = signal.title || titleCase(signal.event_type);
  const detected = `${new Date(signal.published_at ?? "").toLocaleString()} (${relativeTime(signal.published_at)})`;
  const category = categoryLabel(signal.category ?? "");
  const tier = relevanceTier(signal.relevance ?? 0);

  return (
    <div className="flex items-start gap-[18px]">
      <LogoSquare bg="#0f172a" color="#ffffff" icon={Radio} radius={14} size={64} />
      <div>
        <div className="flex flex-wrap items-center gap-[12px]">
          <h1 className="m-0 text-[24px] font-bold text-[#0f172a]">{title}</h1>
          <span className={cn("rounded-[7px] px-[10px] py-[4px] text-[12px] font-semibold", tagTones[tier.tone])}>
            {tier.label}
          </span>
        </div>
        <p className="m-0 mt-[8px] text-[14px] text-[#64748b]">
          <a
            className="font-semibold text-[#334155] no-underline hover:text-[#5b3df5]"
            href={`/enterprise-detail?id=${signal.company_id}`}
          >
            {signal.company_name}
          </a>{" "}
          • Detected on {detected}
        </p>
        <div className="mt-[12px] flex flex-wrap gap-[8px]">
          {signal.category && <Tag label={category} tone="purple" />}
          {isActionable(signal) && <Tag label="Actionable" tone="green" />}
          {(signal.evidence?.length ?? 0) > 1 && <Tag label={`${signal.evidence?.length} sources`} tone="gray" />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Score card                                                          */
/* ------------------------------------------------------------------ */

function ScoreCard({ signal }: { signal: SignalWithCompanyOut | null }) {
  const score = Math.round(signal?.event_score ?? 0);
  const tier = relevanceTier(signal?.relevance ?? 0);

  return (
    <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <p className="m-0 text-[14px] font-semibold text-[#475569]">Event Score</p>
      <div className="mt-[10px] flex items-center gap-[12px]">
        <span className="text-[30px] font-bold leading-none text-[#0f172a]">
          {score} <span className="text-[18px] font-semibold text-[#94a3b8]">/ 100</span>
        </span>
        <span className={cn("rounded-[7px] px-[10px] py-[4px] text-[12px] font-semibold", tagTones[tier.tone])}>
          {tier.label}
        </span>
      </div>
      <p className="m-0 mt-[10px] text-[13px] text-[#94a3b8]">
        Base strength × relevance × freshness × source quality × extraction confidence × status
      </p>
      <div className="mt-[12px] h-[6px] w-full rounded-full bg-[#e5e7eb]">
        <div className="h-full rounded-full bg-[#22c55e]" style={{ width: `${Math.min(100, score)}%` }} />
      </div>
    </div>
  );
}

function ExtractionDetailsCard({ signal }: { signal: SignalWithCompanyOut | null }) {
  if (!signal) return null;

  const rows = (
    [
      { label: "Event Type", value: titleCase(signal.event_type) },
      { label: "Category", value: categoryLabel(signal.category ?? "") },
      {
        label: "Extraction Confidence",
        value: signal.extraction_confidence !== null ? `${Math.round(signal.extraction_confidence * 100)}%` : "—",
      },
      { label: "XSparks Relevance", value: signal.relevance !== null ? `${Math.round(signal.relevance * 100)}%` : "—" },
      { label: "Best Offering", value: signal.best_offering ?? "—" },
      { label: "Actionable", value: isActionable(signal) ? "Yes — active/announced" : "No — exploratory/speculative" },
      signal.public_budget_usd
        ? { label: "Public Budget", value: `${formatUsd(signal.public_budget_usd)}${signal.budget_currency ? ` ${signal.budget_currency}` : ""}` }
        : null,
    ] as ({ label: string; value: string } | null)[]
  ).filter((r): r is { label: string; value: string } => r !== null);

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">
        Extraction Details
        <Info className="size-[15px] text-[#94a3b8]" />
      </h2>
      <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">How this event was identified and classified.</p>

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

/* Real event_score components (backend/app/core/scoring_config.py): the
 * multipliers that combine into event_score, not the old m2/m3/m4 blend. */
function ScoreBreakdownCard({ signal }: { signal: SignalWithCompanyOut | null }) {
  if (!signal) return null;

  const score = Math.round(signal.event_score ?? 0);
  const tier = relevanceTier(signal.relevance ?? 0);

  const components = [
    { label: "Relevance", value: signal.relevance ?? 0, color: "#7c3aed" },
    { label: "Freshness", value: signal.freshness ?? 0, color: "#16a34a" },
    { label: "Source Quality", value: signal.source_quality ?? 0, color: "#f59e0b" },
    { label: "Status", value: signal.status_factor ?? 0, color: "#2563eb" },
  ];

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Score Breakdown</h2>
      <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">
        Event Score = Base Strength × Relevance × Freshness × Source Quality × Extraction Confidence × Status.
      </p>

      <div className="mt-[16px] flex flex-col items-center gap-[22px] sm:flex-row">
        <div className="relative size-[170px] shrink-0">
          <Donut segments={components.map((c) => ({ value: c.value || 0.01, color: c.color }))} size={170} thickness={24} />
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
                <span className="size-[10px] rounded-full" style={{ backgroundColor: c.color }} />
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
/* Details / Sources / Related companies                               */
/* ------------------------------------------------------------------ */

function SignalDetailsCard({ signal, company }: { signal: SignalWithCompanyOut | null; company: CompanyOut | null }) {
  if (!signal) return null;

  const rows = [
    {
      label: "Detected",
      value: `${new Date(signal.published_at ?? "").toLocaleString()} (${relativeTime(signal.published_at)})`,
    },
    { label: "Sources", value: `${signal.evidence?.length ?? 0}` },
    { label: "Location", value: company ? [company.city, company.country].filter(Boolean).join(", ") || "—" : "—" },
    { label: "Employees", value: company?.employee_range ?? "—" },
    { label: "Revenue", value: company?.revenue_range ?? "—" },
    { label: "Industry", value: company?.industries?.[0] ?? "—" },
  ];

  const tags = [categoryLabel(signal.category ?? ""), ...(isActionable(signal) ? ["Actionable"] : [])];
  const description = signal.summary ?? "No summary was extracted for this event.";

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Event Details</h2>

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

/* Every corroborating source, not just one - "Corroborated by N sources" is
 * the whole point of the canonical-dedup design (brief item 11 / 21). */
function SourceSnippetCard({ signal }: { signal: SignalWithCompanyOut | null }) {
  if (!signal) return null;

  const sources = signal.evidence ?? [];

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">
        {sources.length > 1 ? `Sources (${sources.length})` : "Source"}
      </h2>

      {sources.length === 0 ? (
        <p className="m-0 mt-[16px] text-[13px] text-[#94a3b8]">No source captured for this event.</p>
      ) : (
        <div className="mt-[16px] flex flex-col gap-[16px]">
          {sources.slice(0, 5).map((src, i) => (
            <div key={i}>
              <div className="flex items-center gap-[10px]">
                <LogoSquare bg="#dcfce7" color="#16a34a" icon={Database} radius={6} size={26} />
                <div className="min-w-0 leading-tight">
                  <p className="m-0 truncate text-[13px] font-semibold text-[#0f172a]">
                    {src.domain ?? (src.url ? hostnameOf(src.url) : "Unknown source")}
                  </p>
                  <p className="m-0 text-[12px] text-[#94a3b8]">{src.published_date ?? "Date unknown"}</p>
                </div>
              </div>
              {src.snippet && <p className="m-0 mt-[8px] text-[13px] leading-[20px] text-[#64748b]">{src.snippet}</p>}
              {src.url && (
                <a
                  className="mt-[8px] flex w-fit items-center gap-[7px] text-[13px] font-semibold text-[#5b3df5] no-underline"
                  href={src.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Read full article
                  <ExternalLink className="size-[14px]" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type RelatedCompany = { companyId: string; name: string; score: number };

/* Other real companies that have an event in the same category (there's no
 * similarity model in the backend, so "similar" = same category). */
function SimilarCompaniesCard({ related, categoryName }: { related: RelatedCompany[]; categoryName: string }) {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Companies with Similar Events</h2>
      <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">Other companies with a {categoryName} event.</p>

      {related.length === 0 ? (
        <p className="m-0 mt-[16px] text-[13px] text-[#94a3b8]">
          No other companies have a {categoryName} event yet.
        </p>
      ) : (
        <div className="mt-[16px] flex flex-col gap-[16px]">
          {related.map((c) => (
            <div
              className="flex cursor-pointer items-center gap-[12px]"
              key={c.companyId}
              onClick={() => {
                window.location.href = `/enterprise-detail?id=${c.companyId}`;
              }}
              role="button"
              tabIndex={0}
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
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Right rail                                                          */
/* ------------------------------------------------------------------ */

function SummaryCard({ signal, categoryName }: { signal: SignalWithCompanyOut | null; categoryName: string }) {
  if (!signal) return null;

  const categoryDesc = signal.category ? CATEGORY_DESCRIPTIONS[signal.category] : undefined;
  const text = signal.summary
    ? `${signal.summary}${categoryDesc ? ` This is a ${categoryName} event: ${categoryDesc}` : ""}`
    : categoryDesc
      ? `${categoryName} event: ${categoryDesc}`
      : "No summary was extracted for this event.";

  const copy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Event Summary</h2>
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

/* Other real events extracted for this same company, sorted by event_score
 * (see controllers.signals.get_signals). */
function MoreCompanySignalsCard({ rows, companyName }: { rows: CompanySignalRow[]; companyName: string }) {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">More Events from {companyName}</h2>

      {rows.length === 0 ? (
        <p className="m-0 mt-[16px] text-[13px] text-[#94a3b8]">No other events on file for {companyName} yet.</p>
      ) : (
        <div className="mt-[16px] flex flex-col gap-[16px]">
          {rows.map((s) => {
            const style = categoryStyle(s.category);
            const Icon = style.icon;

            return (
              <div
                className="flex cursor-pointer items-center gap-[12px]"
                key={s.signalId}
                onClick={() => {
                  window.location.href = `/signal-detail?id=${s.signalId}`;
                }}
                role="button"
                tabIndex={0}
              >
                <LogoSquare bg={style.bg} color={style.color} icon={Icon} radius={10} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[14px] font-bold text-[#0f172a]">{s.title}</p>
                  <p className="m-0 text-[12px] text-[#94a3b8]">{s.date}</p>
                </div>
                <div className="text-right">
                  <p className="m-0 text-[11px] text-[#94a3b8]">Score</p>
                  <p className="m-0 text-[15px] font-bold text-[#0f172a]">{s.score}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const organisationId = getOrganisationId();
    const signalId = getSignalIdFromUrl();
    if (!organisationId || !signalId) {
      setNotFound(true);
      return;
    }
    getSignalById(organisationId, signalId)
      .then((s) => {
        setSignal(s);

        getCompany(organisationId, s.company_id)
          .then(setCompany)
          .catch(() => setCompany(null));

        getSignals(organisationId, s.company_id)
          .then((rows) => setCompanySignals(rows.filter((r) => r.buying_event_id !== s.buying_event_id)))
          .catch(() => setCompanySignals([]));

        if (s.category) {
          listSignals(organisationId, { category: s.category, page_size: 12 })
            .then((res) => setCategorySignals(res.items.filter((r) => r.company_id !== s.company_id)))
            .catch(() => setCategorySignals([]));
        }
      })
      .catch(() => setNotFound(true));
  }, []);

  const categoryName = signal ? categoryLabel(signal.category ?? "") : "this category";

  const relatedCompanies: RelatedCompany[] = (() => {
    const seen = new Set<string>();
    const rows: RelatedCompany[] = [];
    const sorted = [...categorySignals].sort((a, b) => (b.event_score ?? 0) - (a.event_score ?? 0));
    for (const s of sorted) {
      if (seen.has(s.company_id)) continue;
      seen.add(s.company_id);
      rows.push({ companyId: s.company_id, name: s.company_name, score: Math.round(s.event_score ?? 0) });
      if (rows.length >= 4) break;
    }
    return rows;
  })();

  const otherSignals: CompanySignalRow[] = companySignals.slice(0, 4).map((s) => ({
    signalId: s.buying_event_id,
    title: s.title || titleCase(s.event_type),
    category: s.category ?? "",
    date: s.published_at ? new Date(s.published_at).toLocaleDateString() : "—",
    score: Math.round(s.event_score ?? 0),
  }));

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Signal Intelligence" activeSub="Signal Feed" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          searchPlaceholder="Search companies, triggers, executives..."
          showDetection={false}
          showNotificationBell={false}
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

          {notFound && !signal ? (
            <p className="mt-[24px] text-[14px] font-medium text-[#64748b]">This signal could not be found.</p>
          ) : (
            <div className="mt-[24px] grid grid-cols-1 gap-[24px] xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="flex flex-col gap-[24px]">
                <div className="grid grid-cols-1 gap-[24px] lg:grid-cols-[1.45fr_1fr]">
                  <ExtractionDetailsCard signal={signal} />
                  <ScoreBreakdownCard signal={signal} />
                </div>

                <div className="grid grid-cols-1 gap-[24px] lg:grid-cols-3">
                  <SignalDetailsCard company={company} signal={signal} />
                  <SourceSnippetCard signal={signal} />
                  <SimilarCompaniesCard categoryName={categoryName} related={relatedCompanies} />
                </div>
              </div>

              <div className="flex flex-col gap-[24px]">
                <ScoreCard signal={signal} />
                <SummaryCard categoryName={categoryName} signal={signal} />
                <MoreCompanySignalsCard companyName={signal?.company_name ?? "this company"} rows={otherSignals} />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
