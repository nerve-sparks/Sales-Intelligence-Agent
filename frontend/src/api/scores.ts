/* Mirrors backend/app/routes/scores.py - evidence-based pipeline (no gates/D1-D7/ICP) */
import { apiGet, apiPost } from "./client";

export type EvidenceSource = {
  url: string | null;
  domain: string | null;
  title: string | null;
  snippet: string | null;
  published_date: string | null;
  search_query: string | null;
  query_type: string | null;
  retrieved_at: string | null;
  source_type: string | null;
  position: number | null;
};

export type BuyingEventOut = {
  buying_event_id: string;
  event_type: string;
  category: string | null;
  title: string | null;
  summary: string | null;
  published_at: string | null;
  base_strength: number | null;
  relevance: number | null;
  freshness: number | null;
  source_quality: number | null;
  extraction_confidence: number | null;
  status_factor: number | null;
  event_score: number | null;
  is_negative: boolean;
  penalty_value: number | null;
  best_offering: string | null;
  reasoning: string | null;
  evidence: EvidenceSource[] | null;
  public_budget_usd: number | null;
  budget_currency: string | null;
  budget_confidence: string | null;
};

export type ScoreDetailOut = {
  lead_score_id: string;
  company_id: string;
  lead_score: number | null;
  sales_status: string | null;
  buying_evidence_score: number | null;
  contact_access_score: number | null;
  negative_event_score: number | null;
  evidence_confidence: number | null;
  confidence_label: string | null;
  best_offering: string | null;
  why_now: string | null;
  recommended_action: string | null;
  expected_deal_min_usd: number | null;
  expected_deal_max_usd: number | null;
  expected_deal_value_usd: number | null;
  expected_revenue_usd: number | null;
  deal_value_basis: string | null;
  deal_value_confidence: string | null;
  commercially_viable: boolean | null;
  evidence_summary: unknown;
  scoring_warnings: unknown;
  scored_at: string | null;
  events: BuyingEventOut[];
};

/* Backward-compat alias - the full per-company score shape is ScoreDetailOut
 * now (evidence-based). Prefer ScoreDetailOut in new code. */
export type LeadScoreOut = ScoreDetailOut;

export type NotScoredOut = {
  detail: string;
};

export type RankedLeadScoreOut = {
  company_id: string;
  company_name: string;
  lead_score: number | null;
  sales_status: string | null;
  confidence_label: string | null;
  buying_evidence_score: number | null;
  contact_access_score: number | null;
  negative_event_score: number | null;
  best_offering: string | null;
  why_now: string | null;
  expected_deal_min_usd: number | null;
  expected_deal_max_usd: number | null;
  expected_deal_value_usd: number | null;
  scored_at: string | null;
};

export type ScoreRunResult = {
  sales_ready: number;
  high_priority: number;
  warm: number;
  monitor: number;
  low_priority: number;
};

export function runScoring(organisationId: string, importBatchId?: string): Promise<ScoreRunResult> {
  const qs = importBatchId ? `?import_batch_id=${importBatchId}` : "";
  return apiPost<ScoreRunResult>(`/organisations/${organisationId}/scores/run${qs}`);
}

export function getRankedScores(organisationId: string, importBatchId?: string): Promise<RankedLeadScoreOut[]> {
  const qs = importBatchId ? `?import_batch_id=${importBatchId}` : "";
  return apiGet<RankedLeadScoreOut[]>(`/organisations/${organisationId}/scores/ranked${qs}`);
}

export function getScore(organisationId: string, companyId: string): Promise<ScoreDetailOut | NotScoredOut> {
  return apiGet<ScoreDetailOut | NotScoredOut>(`/organisations/${organisationId}/scores/${companyId}`);
}

export function isScored(score: ScoreDetailOut | NotScoredOut): score is ScoreDetailOut {
  return (score as ScoreDetailOut).lead_score_id !== undefined;
}
