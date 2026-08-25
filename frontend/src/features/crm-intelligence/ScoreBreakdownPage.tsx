import { ChevronRight, ExternalLink, Mail, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { cn } from "../../lib/cn";
import { InfoTooltip } from "../../components/ui/InfoTooltip";
import { getCompany, listDecisionMakers } from "../../api/companies";
import type { CompanyOut, DecisionMakerOut } from "../../api/icp";
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

/* Equal-height cards with internal scroll (scrollbar hidden) - same pattern as
 * Signal Detail's Event Details / Sources / Similar Companies row. */
const EQUAL_CARD =
  "flex h-auto max-h-[420px] min-h-0 flex-col overflow-hidden rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)] xl:h-[360px] xl:max-h-[360px]";
const EQUAL_CARD_BODY =
  "mt-[16px] min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";
const EQUAL_CARD_TALL =
  "flex h-auto max-h-[520px] min-h-0 flex-col overflow-hidden rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)] xl:h-[420px] xl:max-h-[420px]";

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

/* Mirrors backend/app/core/scoring_config.py's ECONOMIC_BUYER_TITLES /
 * RELEVANT_EXEC_TITLES + evidence_scorer._contact_tier - for DISPLAY only
 * (explaining why a contact landed in a tier), the backend's own
 * contact_access_score is always the authoritative number. */
const ECONOMIC_BUYER_TITLES = [
  "ceo", "chief executive", "coo", "chief operating", "cto", "chief technology",
  "cio", "chief information", "chief ai", "chief data", "chief digital",
];
const RELEVANT_EXEC_TITLES = [
  "vp operations", "vp technology", "vp data", "vp automation", "vice president",
  "transformation", "it director", "operations director", "director of it",
  "director of operations", "procurement", "head of data", "head of ai", "head of technology",
];
const CONTACT_TIERS = [
  { score: 20, label: "Economic buyer, verified email" },
  { score: 15, label: "Relevant executive, verified email" },
  { score: 8, label: "Relevant contact, no verified email" },
  { score: 3, label: "Generic company contact" },
  { score: 0, label: "No usable contact found" },
];

function titleMatches(title: string | null, needles: string[]): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return needles.some((n) => t.includes(n));
}

function contactTier(c: DecisionMakerOut): { score: number; label: string } {
  const hasEmail = Boolean(c.email);
  const hasOther = Boolean(c.phone || c.mobile_phone || c.linkedin_url);
  const isEconomic = titleMatches(c.job_title, ECONOMIC_BUYER_TITLES);
  const isRelevant = isEconomic || titleMatches(c.job_title, RELEVANT_EXEC_TITLES);
  if (isEconomic && hasEmail) return CONTACT_TIERS[0];
  if (isRelevant && hasEmail) return CONTACT_TIERS[1];
  if (isRelevant && hasOther) return CONTACT_TIERS[2];
  if (c.email || hasOther || c.job_title) return CONTACT_TIERS[3];
  return CONTACT_TIERS[4];
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
  const positiveEvents = score.events.filter((e) => !e.is_negative).length;
  const negativeEvents = score.events.filter((e) => e.is_negative);
  const rows = [
    {
      label: "Buying Evidence",
      value: score.buying_evidence_score ?? 0,
      max: "/ 80",
      sign: "+",
      tone: "text-[#16a34a]",
      detail:
        positiveEvents > 0
          ? `Built from your ${Math.min(3, positiveEvents)} strongest event(s) out of ${positiveEvents} found`
          : "No positive buying events found",
    },
    {
      label: "Contact Access",
      value: score.contact_access_score ?? 0,
      max: "/ 20",
      sign: "+",
      tone: "text-[#16a34a]",
      detail: CONTACT_TIERS.find((t) => t.score === Math.round(score.contact_access_score ?? 0))?.label ?? "—",
    },
    {
      label: "Negative Evidence",
      value: score.negative_event_score ?? 0,
      max: "",
      sign: "−",
      tone: "text-[#ef4444]",
      detail: negativeEvents.length > 0 ? `${negativeEvents.length} negative event(s) found` : "No negative events found",
    },
  ];
  return (
    <section className={EQUAL_CARD}>
      <div className="shrink-0">
        <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">Lead Score <InfoTooltip text="Buying Evidence + Contact Access - Negative Evidence, clamped to 0-100. Revenue, funding and headcount deliberately do not affect it - they only set Expected Deal Value." /></h2>
        <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">Buying Evidence + Contact Access − Negative Evidence, clamped to 0–100.</p>
      </div>
      <div className={`${EQUAL_CARD_BODY} flex flex-col gap-[12px]`}>
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between gap-[10px]">
              <span className="text-[13px] font-medium text-[#334155]">{r.label}</span>
              <span className={cn("shrink-0 text-[14px] font-bold", r.tone)}>{r.sign} {Math.round(r.value)} <span className="text-[12px] font-normal text-[#94a3b8]">{r.max}</span></span>
            </div>
            <p className="m-0 mt-[2px] text-[11px] leading-[16px] text-[#94a3b8]">{r.detail}</p>
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

/* ---- Contact Access breakdown ---- */
function ContactAccessCard({ score, contacts }: { score: ScoreDetailOut; contacts: DecisionMakerOut[] }) {
  const achievedScore = Math.round(score.contact_access_score ?? 0);
  return (
    <section className={EQUAL_CARD}>
      <div className="shrink-0">
        <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">Contact Access <InfoTooltip text="Scored once per company from the single strongest reachable contact - never summed across contacts. An economic buyer with a verified email is worth 20; a generic company contact, 3." /></h2>
        <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">
          Scored once, from the single strongest reachable contact - never summed across contacts.
        </p>
      </div>

      {contacts.length === 0 ? (
        <p className="m-0 mt-[16px] text-[13px] text-[#94a3b8]">No contacts found for this company yet.</p>
      ) : (
        <div className={`${EQUAL_CARD_BODY} flex flex-col gap-[8px]`}>
          {contacts.map((c) => {
            const tier = contactTier(c);
            const counted = tier.score === achievedScore && tier.score === Math.max(...contacts.map((x) => contactTier(x).score));
            const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed contact";
            return (
              <div
                className={cn(
                  "rounded-[10px] border p-[12px]",
                  counted ? "border-[#bbf7d0] bg-[#f0fdf4]" : "border-[#eef1f6]",
                )}
                key={c.decision_maker_id}
              >
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <div className="min-w-0">
                    <span className="text-[13px] font-bold text-[#0f172a]">{name}</span>
                    <span className="ml-[6px] text-[12px] text-[#64748b]">{c.job_title || "Title unknown"}</span>
                  </div>
                  {counted && <Badge label={`Counted: +${tier.score}`} tone="green" />}
                </div>
                <div className="mt-[6px] flex flex-wrap items-center gap-x-[14px] gap-y-[2px] text-[11px] text-[#94a3b8]">
                  <span className="flex items-center gap-[4px]"><Mail className="size-[11px]" /> {c.email ? "Email on file" : "No email"}</span>
                  <span className="flex items-center gap-[4px]"><Phone className="size-[11px]" /> {c.phone || c.mobile_phone ? "Phone on file" : "No phone"}</span>
                  <span>Tier: {tier.label} (+{tier.score})</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-[12px] shrink-0 border-t border-[#f1f5f9] pt-[12px]">
        <p className="m-0 text-[11px] font-semibold text-[#94a3b8]">Scoring tiers</p>
        <div className="mt-[6px] flex flex-col gap-[3px]">
          {CONTACT_TIERS.map((t) => (
            <div className="flex items-center justify-between text-[11px]" key={t.label}>
              <span className={achievedScore === t.score ? "font-bold text-[#0f172a]" : "text-[#94a3b8]"}>{t.label}</span>
              <span className={achievedScore === t.score ? "font-bold text-[#16a34a]" : "text-[#94a3b8]"}>+{t.score}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---- Deal potential ---- */
function DealPotential({ score }: { score: ScoreDetailOut }) {
  return (
    <section className={EQUAL_CARD}>
      <h2 className="m-0 flex shrink-0 items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">Deal Potential <InfoTooltip text="Expected Deal Value, banded from company revenue. Recent, relevant funding can lift it one band at most. Unknown revenue falls to the most conservative band." /></h2>
      <div className={`${EQUAL_CARD_BODY} flex flex-col`}>
        <div className="grid grid-cols-2 gap-[14px]">
          <Metric label="Expected Range" value={`${formatUsd(score.expected_deal_min_usd)} – ${formatUsd(score.expected_deal_max_usd)}`} />
          <Metric label="Midpoint" value={formatUsd(score.expected_deal_value_usd)} />
          <Metric label="Basis" value={titleize(score.deal_value_basis)} />
          <Metric label="Deal Confidence" value={score.deal_value_confidence ?? "—"} />
          <Metric label="Provisional Weighted Value" value={formatUsd(score.expected_revenue_usd)} />
          <Metric label="Commercially Viable" value={score.commercially_viable ? "Yes" : "No"} />
        </div>
        <p className="m-0 mt-[14px] rounded-[8px] bg-[#f8fafc] p-[10px] text-[12px] leading-[18px] text-[#94a3b8]">
          Provisional weighted value = Lead Score ÷ 100 × deal midpoint. This is not yet calibrated from
          historical conversion outcomes - it is a provisional proxy.
        </p>
      </div>
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
    <section className={`${EQUAL_CARD_TALL} h-full`}>
      <h2 className="m-0 shrink-0 text-[16px] font-bold text-[#0f172a]">Sales Recommendation</h2>
      <div className={`${EQUAL_CARD_BODY} flex flex-col gap-[12px]`}>
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
      <p className="m-0 mt-[3px] break-words text-[13px] leading-[19px] text-[#334155]">{value || "—"}</p>
    </div>
  );
}

/* Mirrors backend/app/core/scoring_config.py's EVIDENCE_WEIGHTS - only the
 * top 3 positive events (by event_score) actually count toward Buying
 * Evidence, at these weights. Shown here so it's obvious a 4th/5th real
 * event doesn't add to the score, matching evidence_scorer.buying_evidence_score. */
const EVIDENCE_WEIGHTS = [1.0, 0.6, 0.4];

const FACTORS: { key: keyof BuyingEventOut; label: string }[] = [
  { key: "base_strength", label: "Base strength" },
  { key: "relevance", label: "XSparks relevance" },
  { key: "freshness", label: "Freshness" },
  { key: "source_quality", label: "Source quality" },
  { key: "extraction_confidence", label: "Extraction confidence" },
  { key: "status_factor", label: "Status factor" },
];

function factorDisplay(key: keyof BuyingEventOut, value: number | null): string {
  if (value === null) return "—";
  return key === "base_strength" ? value.toFixed(0) : value.toFixed(2);
}

/* Plain-language reading of each factor, for reps who don't want to parse
 * decimals - the raw numbers are still available under "Show the math"
 * below. Thresholds mirror the bands in scoring_config.py. */
function relevanceLabel(v: number | null): string {
  if (v === null) return "Unknown fit";
  if (v >= 0.85) return "Very strong fit";
  if (v >= 0.55) return "Good fit";
  if (v >= 0.25) return "Weak fit";
  return "Not relevant";
}
function freshnessLabel(v: number | null): string {
  if (v === null) return "Unknown age";
  if (v >= 0.95) return "Very recent";
  if (v >= 0.85) return "Recent (~3 months)";
  if (v >= 0.65) return "Within the year";
  if (v >= 0.45) return "Getting old (~18 months)";
  return "Old";
}
function sourceQualityLabel(v: number | null): string {
  if (v === null) return "Unknown source";
  if (v >= 0.9) return "Official / independent press";
  if (v >= 0.75) return "Company or industry source";
  if (v >= 0.55) return "Aggregator / directory";
  return "Unverified source";
}
function confidenceLabel(v: number | null): string {
  if (v === null) return "Unknown confidence";
  if (v >= 0.85) return "High AI confidence";
  if (v >= 0.6) return "Medium AI confidence";
  return "Low AI confidence";
}
function statusFactorLabel(v: number | null): string {
  if (v === null) return "Unknown status";
  if (v >= 0.95) return "Active now";
  if (v >= 0.8) return "Announced";
  if (v >= 0.55) return "Being explored";
  if (v >= 0.4) return "Speculative";
  if (v > 0) return "Already completed";
  return "No longer relevant";
}
function baseStrengthLabel(v: number | null): string {
  if (v === null) return "Unknown event type";
  if (v >= 65) return "Very strong signal type";
  if (v >= 45) return "Strong signal type";
  if (v >= 25) return "Moderate signal type";
  return "Weak signal type";
}

/* ---- Evidence events ---- */
function EvidenceEvent({ event, weightIndex }: { event: BuyingEventOut; weightIndex: number | null }) {
  const sources = event.evidence ?? [];
  const weight = weightIndex !== null ? EVIDENCE_WEIGHTS[weightIndex] : null;
  const formula = FACTORS.map((f) => factorDisplay(f.key, event[f.key] as number | null)).join(" × ");
  const [showMath, setShowMath] = useState(false);
  const plainLabels = [
    baseStrengthLabel(event.base_strength),
    relevanceLabel(event.relevance),
    freshnessLabel(event.freshness),
    sourceQualityLabel(event.source_quality),
    confidenceLabel(event.extraction_confidence),
    statusFactorLabel(event.status_factor),
  ];

  return (
    <div className="rounded-[12px] border border-[#eef1f6] p-[16px]">
      <div className="flex flex-wrap items-start justify-between gap-[8px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-[8px]">
            <span className="text-[14px] font-bold text-[#0f172a]">{event.title || titleize(event.event_type)}</span>
            <Badge label={titleize(event.event_type)} tone={event.is_negative ? "red" : "blue"} />
            {!event.is_negative && (
              <Badge
                label={
                  weightIndex === 0
                    ? "Your #1 strongest signal"
                    : weightIndex === 1
                      ? "Your #2 strongest signal"
                      : weightIndex === 2
                        ? "Your #3 strongest signal"
                        : "Doesn't count toward score"
                }
                tone={weight !== null ? "green" : "gray"}
              />
            )}
          </div>
          <p className="m-0 mt-[4px] text-[13px] text-[#475569]">{event.summary || "—"}</p>
        </div>
        <div className="text-right">
          <p className="m-0 text-[18px] font-bold text-[#0f172a]">{event.is_negative ? `−${Math.round(event.penalty_value ?? 0)}` : Math.round(event.event_score ?? 0)}</p>
          <p className="m-0 text-[11px] text-[#94a3b8]">{event.is_negative ? "penalty" : "event score"}</p>
        </div>
      </div>

      {!event.is_negative && (
        <div className="mt-[10px] rounded-[8px] bg-[#f8fafc] p-[10px]">
          <div className="flex flex-wrap gap-[6px]">
            {plainLabels.map((label) => (
              <span
                className="rounded-[6px] border border-[#e2e8f0] bg-white px-[8px] py-[3px] text-[11px] font-medium text-[#334155]"
                key={label}
              >
                {label}
              </span>
            ))}
          </div>
          <button
            className="mt-[8px] bg-transparent p-0 text-[11px] font-semibold text-[#4f46e5]"
            onClick={() => setShowMath((v) => !v)}
            type="button"
          >
            {showMath ? "Hide the math ▾" : "Show the math ▸"}
          </button>
          {showMath && (
            <div className="mt-[8px] border-t border-[#e2e8f0] pt-[8px]">
              <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-3 lg:grid-cols-6">
                {FACTORS.map((f) => (
                  <div key={f.key}>
                    <p className="m-0 text-[10px] text-[#94a3b8]">{f.label}</p>
                    <p className="m-0 text-[13px] font-bold text-[#0f172a]">{factorDisplay(f.key, event[f.key] as number | null)}</p>
                  </div>
                ))}
              </div>
              <p className="m-0 mt-[8px] text-[11px] text-[#64748b]">
                {formula} = <span className="font-bold text-[#0f172a]">{event.event_score !== null ? event.event_score.toFixed(2) : "—"}</span>
              </p>
            </div>
          )}
        </div>
      )}

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
  const positive = [...events.filter((e) => !e.is_negative)].sort((a, b) => (b.event_score ?? 0) - (a.event_score ?? 0));
  const negative = events.filter((e) => e.is_negative);
  // Only the top 3 positive events count toward Buying Evidence (see
  // EVIDENCE_WEIGHTS) - map each event to its weight index (0/1/2) or null.
  const weightIndexById = new Map(positive.map((e, i) => [e.buying_event_id, i < 3 ? i : null]));
  const sorted = [...positive, ...negative];
  return (
    <section className={`${EQUAL_CARD_TALL} h-full`}>
      <div className="shrink-0">
        <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">Evidence Events <InfoTooltip text="Only the strongest three independent events contribute, weighted 1.0 / 0.6 / 0.4 and capped at 80. Several articles about one event count once, with the extra sources raising confidence instead." /></h2>
        <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">Every real signal we found, strongest first. Duplicate articles about the same event are combined into one. Only your top 3 signals actually count toward the score below.</p>
      </div>
      {events.length === 0 ? (
        <p className="m-0 mt-[16px] text-[13px] text-[#94a3b8]">No buying events found for this company yet.</p>
      ) : (
        <div className={`${EQUAL_CARD_BODY} flex flex-col gap-[12px]`}>
          {sorted.map((e) => (
            <EvidenceEvent event={e} key={e.buying_event_id} weightIndex={weightIndexById.get(e.buying_event_id) ?? null} />
          ))}
        </div>
      )}
    </section>
  );
}

export function ScoreBreakdownPage() {
  const [company, setCompany] = useState<CompanyOut | null>(null);
  const [score, setScore] = useState<ScoreDetailOut | NotScoredOut | null>(null);
  const [contacts, setContacts] = useState<DecisionMakerOut[]>([]);

  useEffect(() => {
    const organisationId = getOrganisationId();
    const companyId = getCompanyIdFromUrl();
    if (!organisationId || !companyId) return;
    getCompany(organisationId, companyId).then(setCompany).catch(() => setCompany(null));
    getScore(organisationId, companyId).then(setScore).catch(() => setScore(null));
    listDecisionMakers(organisationId, companyId).then(setContacts).catch(() => setContacts([]));
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
              <div className="mt-[22px] grid grid-cols-1 gap-[20px] xl:grid-cols-3 xl:items-stretch">
                <Composition score={s} />
                <ContactAccessCard contacts={contacts} score={s} />
                <DealPotential score={s} />
              </div>
              <div className="mt-[20px] grid grid-cols-1 gap-[20px] xl:grid-cols-3 xl:items-stretch">
                <div className="min-h-0 xl:col-span-2">
                  <EvidenceEvents events={s.events} />
                </div>
                <div className="min-h-0">
                  <Recommendation score={s} />
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
