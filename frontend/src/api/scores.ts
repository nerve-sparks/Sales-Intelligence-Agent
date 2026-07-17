/* Mirrors backend/app/routes/scores.py */
import { apiGet, apiPost } from "./client";

export type LeadScoreOut = {
  lead_score_id: string;
  company_id: string;
  gate_check_1: boolean | null;
  gate_check_2: boolean | null;
  gate_check_3: boolean | null;
  gate_check_4: boolean | null;
  gate_check_5: boolean | null;
  gate_passed: boolean | null;
  gate_status: string | null;
  d1_pain_acuity: number | null;
  d2_ai_intent: number | null;
  d3_economic_capacity: number | null;
  d4_authority: number | null;
  d5_timing_catalyst: number | null;
  d6_solution_fit: number | null;
  d7_competitive: number | null;
  component_score: number | null;
  p_convert: number | null;
  expected_deal_value_usd: number | null;
  lead_score: number | null;
  scored_at: string | null;
};

export type NotScoredOut = {
  detail: string;
};

export type RankedLeadScoreOut = {
  company_name: string;
  lead_score: number | null;
  component_score: number | null;
  gate_status: string | null;
};

export type ScoreRunResult = {
  active: number;
  nurture: number;
};

export function runScoring(organisationId: string): Promise<ScoreRunResult> {
  return apiPost<ScoreRunResult>(`/organisations/${organisationId}/scores/run`);
}

export function getRankedScores(organisationId: string): Promise<RankedLeadScoreOut[]> {
  return apiGet<RankedLeadScoreOut[]>(`/organisations/${organisationId}/scores/ranked`);
}

export function getScore(organisationId: string, companyId: string): Promise<LeadScoreOut | NotScoredOut> {
  return apiGet<LeadScoreOut | NotScoredOut>(`/organisations/${organisationId}/scores/${companyId}`);
}
