import { ChevronRight, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Donut } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";
import { getCompany } from "../../api/companies";
import type { CompanyOut } from "../../api/icp";
import { getScore, type LeadScoreOut, type NotScoredOut } from "../../api/scores";
import { getSignals, type SignalOut } from "../../api/signals";
import { getOrganisationId } from "../../lib/session";

/* Score Breakdown shows ONLY real data: the company's firmographic header,
 * the actual lead score + gate checks, the real d1-d7 scoring dimensions
 * (the donut/table), and the company's real extracted signals. The chart
 * visuals are unchanged - they're just fed real values now. The old "Score
 * History" line chart had no backing (there's no per-company score time
 * series in the data - a company is re-scored fresh on each upload), so it
 * shows an honest empty state instead of a fabricated trend. */

function getCompanyIdFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("id");
}

function isScored(score: LeadScoreOut | NotScoredOut | null): score is LeadScoreOut {
  return score !== null && "lead_score_id" in score;
}

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

function formatUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const ACRONYMS = new Set(["ai", "it", "hr", "ceo", "cto", "cfo", "rfp", "ipo", "pe"]);

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
};

function Badge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-[6px] px-[8px] py-[3px] text-[11px] font-semibold", toneClass[tone])}>
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Header + summary                                                    */
/* ------------------------------------------------------------------ */

function Header({ company, score }: { company: CompanyOut | null; score: LeadScoreOut | NotScoredOut | null }) {
  const name = company?.company_name ?? "Company";
  const initials = company
    ? name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "—";
  const meta =
    [
      company?.company_domain,
      [company?.city, company?.country].filter(Boolean).join(", ") || null,
      company?.employee_count ? `${company.employee_count.toLocaleString()} Employees` : null,
      company?.industries?.[0],
    ]
      .filter(Boolean)
      .join(" • ") || "—";
  const scored = isScored(score);
  const overallScore = scored && score.lead_score !== null ? Math.round(score.lead_score) : null;
  const gateStatus = scored ? score.gate_status : null;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-[12px]">
        <div>
          <nav className="flex items-center gap-[8px] text-[13px] text-[#64748b]">
            <a className="font-semibold text-[#5b3df5] no-underline" href="/enterprise-list">Enterprise List</a>
            <ChevronRight className="size-[14px] text-[#cbd5e1]" />
            <span className="font-semibold text-[#0f172a]">{name}</span>
          </nav>
          <h1 className="m-0 mt-[10px] text-[26px] font-bold text-[#0f172a]">Score Breakdown</h1>
          <p className="m-0 mt-[6px] text-[15px] text-[#64748b]">
            How {name}'s lead score is composed across the scoring dimensions and gate checks.
          </p>
        </div>
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-px overflow-hidden rounded-[16px] border border-[#eef1f6] bg-[#eef1f6] lg:grid-cols-[minmax(0,1.6fr)_1fr_1fr_1fr]">
        <div className="flex items-center gap-[14px] bg-white p-[18px]">
          <span className="flex size-[48px] shrink-0 items-center justify-center rounded-[12px] bg-[#e6f0ff] text-[15px] font-bold text-[#2563eb]">{initials}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-[8px]">
              <p className="m-0 text-[17px] font-bold text-[#0f172a]">{name}</p>
              {gateStatus && <Badge label={gateStatus === "active" ? "Active" : "Nurture"} tone={gateStatus === "active" ? "green" : "orange"} />}
            </div>
            <p className="m-0 mt-[3px] truncate text-[12px] text-[#64748b]">{meta}</p>
          </div>
        </div>
        <div className="bg-white p-[18px]">
          <p className="m-0 text-[12px] text-[#94a3b8]">Overall Score</p>
          <div className="mt-[6px] flex items-baseline gap-[8px]">
            <span className="text-[26px] font-bold leading-none text-[#0f172a]">{overallScore ?? "—"}</span>
            <span className="text-[13px] text-[#94a3b8]">/100</span>
            {overallScore !== null && (
              <Badge label={overallScore >= 75 ? "Good Fit" : overallScore >= 50 ? "Fair Fit" : "Poor Fit"} tone={overallScore >= 75 ? "green" : overallScore >= 50 ? "orange" : "red"} />
            )}
          </div>
        </div>
        <div className="bg-white p-[18px]">
          <p className="m-0 text-[12px] text-[#94a3b8]">P(Convert)</p>
          <p className="m-0 mt-[6px] text-[16px] font-bold text-[#0f172a]">
            {scored && score.p_convert !== null ? `${Math.round(score.p_convert * 100)}%` : "—"}
          </p>
          <p className="m-0 mt-[3px] text-[12px] text-[#94a3b8]">Est. deal {scored ? formatUsd(score.expected_deal_value_usd) : "—"}</p>
        </div>
        <div className="bg-white p-[18px]">
          <p className="m-0 text-[12px] text-[#94a3b8]">Last Scored</p>
          <p className="m-0 mt-[6px] text-[14px] font-bold text-[#0f172a]">{scored ? formatDateTime(score.scored_at) : "—"}</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Score by Dimension (real d1-d7)                                     */
/* ------------------------------------------------------------------ */

// Labels reflect the enhanced engine (lead_scorer.py): D1/D2/D5 are now
// Gemini-judged (buying signal, intent relevance, urgency) instead of raw
// signal counts; D6 is a real graded ICP-fit score instead of a hardcoded
// 50. D7 is still computed/stored but no longer part of the lead_score
// blend - see the "not weighted" note rendered below its row.
const REAL_DIMENSION_LABELS: { key: keyof LeadScoreOut; name: string; color: string }[] = [
  { key: "d1_pain_acuity", name: "Buying Signal", color: "#2563eb" },
  { key: "d2_ai_intent", name: "Intent Relevance", color: "#16a34a" },
  { key: "d3_economic_capacity", name: "Economic Capacity", color: "#7c3aed" },
  { key: "d4_authority", name: "Authority", color: "#f59e0b" },
  { key: "d5_timing_catalyst", name: "Timing", color: "#f97316" },
  { key: "d6_solution_fit", name: "ICP Fit", color: "#ef4444" },
  { key: "d7_competitive", name: "Competitive (not weighted)", color: "#94a3b8" },
];

function toRealDimensions(score: LeadScoreOut) {
  return REAL_DIMENSION_LABELS.map((d) => {
    const raw = score[d.key];
    const value = typeof raw === "number" ? raw : 0;
    const impact = value >= 75 ? "High" : value >= 50 ? "Medium" : "Low";
    const impTone = value >= 75 ? "green" : value >= 50 ? "orange" : "red";
    return { name: d.name, score: Math.round(value), impact, impTone, color: d.color, val: value || 0.01 };
  });
}

// Weightage / weighted-score aren't persisted per-dimension on the backend
// (the model blends d1-d7 into component_score internally), so those columns
// aren't shown - only the real per-dimension scores.
const dimCols = "grid-cols-[minmax(0,1.6fr)_0.9fr_0.9fr]";

function ScoreByDimension({ score }: { score: LeadScoreOut | NotScoredOut | null }) {
  const scored = isScored(score);
  const allDimensions = scored ? toRealDimensions(score) : [];
  // D7 no longer feeds lead_score (see lead_scorer.py's p_score weights) -
  // excluded from the donut (which visually implies "these compose the
  // score") and shown as a separate informational row below instead.
  const dimensions = allDimensions.filter((d) => d.name !== "Competitive (not weighted)");
  const competitive = allDimensions.find((d) => d.name === "Competitive (not weighted)");
  const overallScore = scored && score.lead_score !== null ? Math.round(score.lead_score) : null;

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-[12px]">
        <div>
          <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">Score by Dimension <Info className="size-[14px] text-[#cbd5e1]" /></h2>
          <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">The six scoring dimensions (d1-d6) that compose this company's lead score.</p>
        </div>
      </div>

      {!scored ? (
        <p className="m-0 mt-[16px] text-[13px] text-[#94a3b8]">
          Not scored yet. Run scoring from the Enterprise List to see the dimension breakdown.
        </p>
      ) : (
        <div className="mt-[16px] flex flex-col items-center gap-[24px] xl:flex-row xl:items-start">
          <div className="relative size-[220px] shrink-0">
            <Donut segments={dimensions.map((d) => ({ value: d.val, color: d.color }))} size={220} thickness={30} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[34px] font-bold leading-none text-[#0f172a]">{overallScore}</span>
              <span className="mt-[3px] text-[13px] text-[#94a3b8]">/100</span>
            </div>
          </div>

          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="min-w-[420px]">
              <div className={cn("grid gap-[12px] border-b border-[#eef1f6] pb-[10px] text-[12px] font-semibold text-[#94a3b8]", dimCols)}>
                <span>Dimension</span>
                <span>Score</span>
                <span>Impact</span>
              </div>
              <div className="divide-y divide-[#f1f5f9]">
                {dimensions.map((d) => (
                  <div className={cn("grid items-center gap-[12px] py-[11px] text-[13px]", dimCols)} key={d.name}>
                    <span className="flex items-center gap-[10px] font-semibold text-[#0f172a]">
                      <span className="size-[9px] shrink-0 rounded-full" style={{ backgroundColor: d.color }} /> {d.name}
                    </span>
                    <span className="text-[#334155]">{d.score}<span className="text-[#94a3b8]">/100</span></span>
                    <span><Badge label={d.impact} tone={d.impTone} /></span>
                  </div>
                ))}
              </div>
              {competitive && (
                <div className={cn("grid items-center gap-[12px] border-t border-dashed border-[#eef1f6] pt-[11px] text-[13px] italic text-[#94a3b8]", dimCols)}>
                  <span className="flex items-center gap-[10px]">
                    <span className="size-[9px] shrink-0 rounded-full" style={{ backgroundColor: competitive.color }} /> {competitive.name}
                  </span>
                  <span>{competitive.score}<span>/100</span></span>
                  <span><Badge label={competitive.impact} tone={competitive.impTone} /></span>
                </div>
              )}
              <div className={cn("grid items-center gap-[12px] border-t border-[#eef1f6] pt-[12px] text-[13px] font-bold text-[#0f172a]", dimCols)}>
                <span>Component Score</span>
                <span>{score.component_score !== null ? `${Math.round(score.component_score)}/100` : "—"}</span>
                <span />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Gate Checks (real)                                                  */
/* ------------------------------------------------------------------ */

const GATE_LABELS = ["AI Intent", "Reachable", "Economic Capacity", "Active Signal", "Recency"];

function GateChecks({ score }: { score: LeadScoreOut | NotScoredOut | null }) {
  const scored = isScored(score);
  const gates = scored
    ? [score.gate_check_1, score.gate_check_2, score.gate_check_3, score.gate_check_4, score.gate_check_5]
    : [];

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">Gate Checks <Info className="size-[14px] text-[#cbd5e1]" /></h2>
      <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">All five gates must pass for a company to become an active lead.</p>

      {!scored ? (
        <p className="m-0 mt-[16px] text-[13px] text-[#94a3b8]">Not scored yet.</p>
      ) : (
        <div className="mt-[16px] flex flex-col gap-[10px]">
          {GATE_LABELS.map((label, i) => (
            <div className="flex items-center justify-between gap-[10px]" key={label}>
              <span className="flex items-center gap-[10px] text-[13px] font-medium text-[#334155]">
                <span className={cn("flex size-[24px] shrink-0 items-center justify-center rounded-[6px] text-[11px] font-bold", gates[i] ? "bg-[#e7f8ef] text-[#16a34a]" : "bg-[#fee2e2] text-[#ef4444]")}>{i + 1}</span>
                {label}
              </span>
              <Badge label={gates[i] ? "Pass" : "Fail"} tone={gates[i] ? "green" : "red"} />
            </div>
          ))}
          <div className="mt-[4px] flex items-center justify-between gap-[10px] border-t border-[#f1f5f9] pt-[12px]">
            <span className="text-[13px] font-bold text-[#0f172a]">Gate Status</span>
            <Badge label={score.gate_status === "active" ? "Active" : "Nurture"} tone={score.gate_status === "active" ? "green" : "orange"} />
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Top Signals (real)                                                  */
/* ------------------------------------------------------------------ */

const sigCols = "grid-cols-[minmax(0,1.8fr)_1fr_0.7fr_0.9fr]";

function TopSignals({ signals }: { signals: SignalOut[] }) {
  const sorted = [...signals].sort((a, b) => (b.signal_confidence ?? 0) - (a.signal_confidence ?? 0));

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 flex items-center gap-[8px] text-[16px] font-bold text-[#0f172a]">Top Signals <Info className="size-[14px] text-[#cbd5e1]" /></h2>

      {signals.length === 0 ? (
        <p className="m-0 mt-[14px] text-[13px] text-[#94a3b8]">No signals extracted for this company yet.</p>
      ) : (
        <div className="mt-[14px] overflow-x-auto">
          <div className="min-w-[520px]">
            <div className={cn("grid gap-[12px] border-b border-[#eef1f6] pb-[10px] text-[12px] font-semibold text-[#94a3b8]", sigCols)}>
              <span>Signal</span>
              <span>Category</span>
              <span>Type</span>
              <span>Confidence</span>
            </div>
            <div className="divide-y divide-[#f1f5f9]">
              {sorted.slice(0, 10).map((s, i) => {
                const conf = s.signal_confidence ?? 0;
                const barColor = conf >= 0.6 ? "#16a34a" : conf >= 0.4 ? "#f59e0b" : "#ef4444";
                return (
                  <div className={cn("grid items-center gap-[12px] py-[11px] text-[13px]", sigCols)} key={s.signal_id}>
                    <span className="flex min-w-0 items-center gap-[10px]">
                      <span className="flex size-[24px] shrink-0 items-center justify-center rounded-[6px] bg-[#eef1ff] text-[11px] font-bold text-[#5b3df5]">{i + 1}</span>
                      <span className="truncate font-medium text-[#334155]">{titleize(s.signal_type)}</span>
                    </span>
                    <span className="truncate text-[#64748b]">{titleize(s.signal_category)}</span>
                    <span>
                      <Badge label={s.is_action ? "Action" : "Mention"} tone={s.is_action ? "green" : "gray"} />
                    </span>
                    <span className="flex items-center gap-[8px]">
                      <span className="h-[6px] flex-1 rounded-full bg-[#eef1f6]">
                        <span className="block h-full rounded-full" style={{ width: `${Math.round(conf * 100)}%`, backgroundColor: barColor }} />
                      </span>
                      <span className="w-[34px] shrink-0 text-right text-[12px] font-semibold text-[#0f172a]">{Math.round(conf * 100)}%</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function ScoreBreakdownPage() {
  const [company, setCompany] = useState<CompanyOut | null>(null);
  const [score, setScore] = useState<LeadScoreOut | NotScoredOut | null>(null);
  const [signals, setSignals] = useState<SignalOut[]>([]);

  useEffect(() => {
    const organisationId = getOrganisationId();
    const companyId = getCompanyIdFromUrl();
    if (!organisationId || !companyId) {
      return;
    }
    getCompany(organisationId, companyId).then(setCompany).catch(() => setCompany(null));
    getScore(organisationId, companyId).then(setScore).catch(() => setScore(null));
    getSignals(organisationId, companyId).then(setSignals).catch(() => setSignals([]));
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
          <Header company={company} score={score} />

          <div className="mt-[22px]">
            <ScoreByDimension score={score} />
          </div>

          <div className="mt-[20px] grid grid-cols-1 gap-[20px] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <GateChecks score={score} />
            <TopSignals signals={signals} />
          </div>
        </main>
      </div>
    </div>
  );
}
