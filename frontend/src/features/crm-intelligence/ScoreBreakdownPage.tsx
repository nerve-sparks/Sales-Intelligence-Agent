import { ChevronRight, ExternalLink, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { cn } from "../../lib/cn";
import { getCompany } from "../../api/companies";
import type { CompanyOut } from "../../api/icp";
import { getScore, isScored, type BuyingEventOut, type ScoreDetailOut, type NotScoredOut } from "../../api/scores";
import { getOrganisationId } from "../../lib/session";

/* Score Breakdown for the evidence-based pipeline (brief section 27):
 *   Lead Score = Buying Evidence + Contact Access - Negative Evidence
 * Shows the score composition, each unique buying event with its scoring
 * factors and source links (corroborating sources collapsed into one event -
 * never repeated), the deal-value reasoning, and the sales recommendation. No
 * D1-D7 dimensions, no gate checks - those are gone from the product. */

function getCompanyIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("id");
}

const pageBackground = "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

function formatUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Date unknown";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const ACRONYMS = new Set(["ai", "it", "hr", "ceo", "cto", "cfo", "rfp", "ipo", "pe", "erp", "mes"]);
function titleize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .split(/[_\s]+/)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

const toneClass: Record<string, string> = {
  green: "bg-[#e7f8ef] text-[#16a34a]",
  orange: "bg-[#fff1e3] text-[#f97316]",
  red: "bg-[#fee2e2] text-[#ef4444]",
  gray: "bg-[#f1f5f9] text-[#64748b]",
  blue: "bg-[#e6f0ff] text-[#2563eb]",
};

function Badge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-[6px] px-[8px] py-[3px] text-[11px] font-semibold", toneClass[tone])}>
      {label}
    </span>
  );
}

function statusTone(status: string | null): string {
  if (status === "Sales Ready" || status === "High Priority") return "green";
  if (status === "Warm") return "orange";
  return "gray";
}

/* ---- Header ---- */
function Header({ company, score }: { company: CompanyOut | null; score: ScoreDetailOut | NotScoredOut | null }) {
  const name = company?.company_name ?? "Company";
  const initials = company ? name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "—";
  const meta =
    [company?.company_domain, [company?.city, company?.country].filter(Boolean).join(", ") || null, company?.industries?.[0]]
      .filter(Boolean)
      .join(" • ") || "—";
  const scored = score !== null && isScored(score);
  const s = scored ? (score as ScoreDetailOut) : null;
  const overall = s && s.lead_score !== null ? Math.round(s.lead_score) : null;

  return (
    <div>
      <nav className="flex items-center gap-[8px] text-[13px] text-[#64748b]">
        <a className="font-semibold text-[#5b3df5] no-underline" href="/enterprise-list">Enterprise List</a>
        <ChevronRight className="size-[14px] text-[#cbd5e1]" />
        <span className="font-semibold text-[#0f172a]">{name}</span>
      </nav>
      <h1 className="m-0 mt-[10px] text-[26px] font-bold text-[#0f172a]">Score Breakdown</h1>
      <p className="m-0 mt-[6px] text-[15px] text-[#64748b]">
        {name}'s lead score from real buying evidence, contact access, and negative signals.
      </p>

      <div className="mt-[18px] grid grid-cols-1 gap-px overflow-hidden rounded-[16px] border border-[#eef1f6] bg-[#eef1f6] lg:grid-cols-[minmax(0,1.6fr)_1fr_1fr_1fr]">
        <div className="flex items-center gap-[14px] bg-white p-[18px]">
          <span className="flex size-[48px] shrink-0 items-center justify-center rounded-[12px] bg-[#e6f0ff] text-[15px] font-bold text-[#2563eb]">{initials}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-[8px]">
              <p className="m-0 text-[17px] font-bold text-[#0f172a]">{name}</p>
              {s?.sales_status && <Badge label={s.sales_status} tone={statusTone(s.sales_status)} />}
            </div>
            <p className="m-0 mt-[3px] truncate text-[12px] text-[#64748b]">{meta}</p>
          </div>
        </div>
        <div className="bg-white p-[18px]">
          <p className="m-0 text-[12px] text-[#94a3b8]">Lead Score</p>
          <div className="mt-[6px] flex items-baseline gap-[8px]">
            <span className="text-[26px] font-bold leading-none text-[#0f172a]">{overall ?? "—"}</span>
            <span className="text-[13px] text-[#94a3b8]">/100</span>
          </div>
        </div>
        <div className="bg-white p-[18px]">
          <p className="m-0 text-[12px] text-[#94a3b8]">Confidence</p>
          <p className="m-0 mt-[6px] text-[16px] font-bold text-[#0f172a]">{s?.confidence_label ?? "—"}</p>
        </div>
        <div className="bg-white p-[18px]">
          <p className="m-0 text-[12px] text-[#94a3b8]">Expected Deal</p>
          <p className="m-0 mt-[6px] text-[14px] font-bold text-[#0f172a]">
            {s ? `${formatUsd(s.expected_deal_min_usd)} – ${formatUsd(s.expected_deal_max_usd)}` : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---- Score composition ---- */
function Composition({ score }: { score: ScoreDetailOut }) {
  const rows = [
    { label: "Buying Evidence", value: score.buying_evidence_score ?? 0, max: "/ 80", sign: "+", tone: "text-[#16a34a]" },
    { label: "Contact Access", value: score.contact_access_score ?? 0, max: "/ 20", sign: "+", tone: "text-[#16a34a]" },
    { label: "Negative Evidence", value: score.negative_event_score ?? 0, max: "", sign: "−", tone: "text-[#ef4444]" },
  ];
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">Lead Score <Info className="size-[14px] text-[#cbd5e1]" /></h2>
      <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">Buying Evidence + Contact Access − Negative Evidence, clamped to 0–100.</p>
      <div className="mt-[16px] flex flex-col gap-[10px]">
        {rows.map((r) => (
          <div className="flex items-center justify-between gap-[10px]" key={r.label}>
            <span className="text-[13px] font-medium text-[#334155]">{r.label}</span>
            <span className={cn("text-[14px] font-bold", r.tone)}>{r.sign} {Math.round(r.value)} <span className="text-[12px] font-normal text-[#94a3b8]">{r.max}</span></span>
          </div>
        ))}
        <div className="mt-[4px] flex items-center justify-between gap-[10px] border-t border-[#f1f5f9] pt-[12px]">
          <span className="text-[14px] font-bold text-[#0f172a]">Final Lead Score</span>
          <span className="text-[18px] font-bold text-[#0f172a]">{score.lead_score !== null ? Math.round(score.lead_score) : "—"}<span className="text-[13px] font-normal text-[#94a3b8]"> / 100</span></span>
        </div>
      </div>
    </section>
  );
}

/* ---- Deal potential ---- */
function DealPotential({ score }: { score: ScoreDetailOut }) {
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">Deal Potential <Info className="size-[14px] text-[#cbd5e1]" /></h2>
      <div className="mt-[16px] grid grid-cols-2 gap-[14px]">
        <Metric label="Expected Range" value={`${formatUsd(score.expected_deal_min_usd)} – ${formatUsd(score.expected_deal_max_usd)}`} />
        <Metric label="Midpoint" value={formatUsd(score.expected_deal_value_usd)} />
        <Metric label="Basis" value={titleize(score.deal_value_basis)} />
        <Metric label="Deal Confidence" value={score.deal_value_confidence ?? "—"} />
        <Metric label="Provisional Weighted Value" value={formatUsd(score.expected_revenue_usd)} />
        <Metric label="Commercially Viable" value={score.commercially_viable ? "Yes" : "No"} />
      </div>
      <p className="m-0 mt-[14px] rounded-[8px] bg-[#f8fafc] p-[10px] text-[12px] text-[#94a3b8]">
        Provisional weighted value = Lead Score ÷ 100 × deal midpoint. This is not yet calibrated from
        historical conversion outcomes - it is a provisional proxy.
      </p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="m-0 text-[12px] text-[#94a3b8]">{label}</p>
      <p className="m-0 mt-[3px] text-[14px] font-bold text-[#0f172a]">{value}</p>
    </div>
  );
}

/* ---- Recommendation ---- */
function Recommendation({ score }: { score: ScoreDetailOut }) {
  const risks = score.events.filter((e) => e.is_negative);
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Sales Recommendation</h2>
      <div className="mt-[14px] flex flex-col gap-[12px]">
        <Field label="Why now" value={score.why_now} />
        <Field label="Best XSparks offering" value={score.best_offering} />
        <Field label="Recommended action" value={score.recommended_action} />
        {risks.length > 0 && (
          <div>
            <p className="m-0 text-[12px] font-semibold text-[#ef4444]">Risks / negative evidence</p>
            <ul className="m-0 mt-[4px] pl-[18px] text-[13px] text-[#475569]">
              {risks.map((r) => <li key={r.buying_event_id}>{r.title || titleize(r.event_type)}</li>)}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="m-0 text-[12px] font-semibold text-[#94a3b8]">{label}</p>
      <p className="m-0 mt-[3px] text-[13px] text-[#334155]">{value || "—"}</p>
    </div>
  );
}

/* ---- Evidence events ---- */
function EvidenceEvent({ event }: { event: BuyingEventOut }) {
  const sources = event.evidence ?? [];
  return (
    <div className="rounded-[12px] border border-[#eef1f6] p-[16px]">
      <div className="flex flex-wrap items-start justify-between gap-[8px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-[8px]">
            <span className="text-[14px] font-bold text-[#0f172a]">{event.title || titleize(event.event_type)}</span>
            <Badge label={titleize(event.event_type)} tone={event.is_negative ? "red" : "blue"} />
          </div>
          <p className="m-0 mt-[4px] text-[13px] text-[#475569]">{event.summary || "—"}</p>
        </div>
        <div className="text-right">
          <p className="m-0 text-[18px] font-bold text-[#0f172a]">{event.is_negative ? `−${Math.round(event.penalty_value ?? 0)}` : Math.round(event.event_score ?? 0)}</p>
          <p className="m-0 text-[11px] text-[#94a3b8]">{event.is_negative ? "penalty" : "event score"}</p>
        </div>
      </div>

      <div className="mt-[10px] flex flex-wrap gap-x-[18px] gap-y-[4px] text-[12px] text-[#64748b]">
        <span>Date: {formatDate(event.published_at)}</span>
        <span>XSparks relevance: {event.relevance !== null ? `${Math.round(event.relevance * 100)}%` : "—"}</span>
        <span>Confidence: {event.extraction_confidence !== null ? `${Math.round(event.extraction_confidence * 100)}%` : "—"}</span>
        {event.best_offering && <span>Best fit: {event.best_offering}</span>}
      </div>

      <div className="mt-[10px] border-t border-[#f1f5f9] pt-[10px]">
        <p className="m-0 text-[11px] font-semibold text-[#94a3b8]">
          {sources.length > 1 ? `Corroborated by ${sources.length} sources` : "Source"}
        </p>
        <div className="mt-[4px] flex flex-col gap-[3px]">
          {sources.slice(0, 5).map((src, i) =>
            src.url ? (
              <a className="flex items-center gap-[6px] text-[12px] text-[#2563eb] no-underline hover:underline" href={src.url} key={i} rel="noreferrer" target="_blank">
                <ExternalLink className="size-[12px] shrink-0" />
                <span className="truncate">{src.domain || src.url}</span>
              </a>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

function EvidenceEvents({ events }: { events: BuyingEventOut[] }) {
  const sorted = [...events].sort((a, b) => (b.event_score ?? 0) - (a.event_score ?? 0));
  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">Evidence Events <Info className="size-[14px] text-[#cbd5e1]" /></h2>
      <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">Each unique real-world event, once - multiple articles about the same event are collapsed into a single event with several sources.</p>
      {events.length === 0 ? (
        <p className="m-0 mt-[16px] text-[13px] text-[#94a3b8]">No buying events found for this company yet.</p>
      ) : (
        <div className="mt-[16px] flex flex-col gap-[12px]">
          {sorted.map((e) => <EvidenceEvent event={e} key={e.buying_event_id} />)}
        </div>
      )}
    </section>
  );
}

export function ScoreBreakdownPage() {
  const [company, setCompany] = useState<CompanyOut | null>(null);
  const [score, setScore] = useState<ScoreDetailOut | NotScoredOut | null>(null);

  useEffect(() => {
    const organisationId = getOrganisationId();
    const companyId = getCompanyIdFromUrl();
    if (!organisationId || !companyId) return;
    getCompany(organisationId, companyId).then(setCompany).catch(() => setCompany(null));
    getScore(organisationId, companyId).then(setScore).catch(() => setScore(null));
  }, []);

  const scored = score !== null && isScored(score);
  const s = scored ? (score as ScoreDetailOut) : null;

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Enterprise List" />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar searchPlaceholder="Search companies, triggers, executives..." showDetection={false} showNotificationBell={false} />
        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          <Header company={company} score={score} />
          {!s ? (
            <p className="mt-[22px] text-[14px] text-[#94a3b8]">Not scored yet. Upload prospect data and let research + scoring run.</p>
          ) : (
            <>
              <div className="mt-[22px] grid grid-cols-1 gap-[20px] xl:grid-cols-3">
                <Composition score={s} />
                <DealPotential score={s} />
                <Recommendation score={s} />
              </div>
              <div className="mt-[20px]">
                <EvidenceEvents events={s.events} />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
