/* Mirrors backend/app/routes/signals.py */
import { apiGet, apiPost } from "./client";

export type SignalOut = {
  signal_id: string;
  company_id: string;
  source: string | null;
  original_source: string | null;
  signal_type: string;
  signal_category: string;
  core_fact: string | null;
  dollar_value_usd: number | null;
  extraction_method: string | null;
  extraction_confidence: number | null;
  is_action: boolean | null;
  m2_corroboration: number | null;
  m3_recency: number | null;
  m4_resourcing: number | null;
  signal_confidence: number | null;
  ingested_at: string | null;
  scored_at: string | null;
};

export type SignalExtractResult = {
  inserted: number;
  skipped: number;
};

export type SignalRescoreResult = {
  rescored: number;
};

export type SignalWithCompanyOut = SignalOut & {
  company_name: string;
};

export type SignalListOut = {
  items: SignalWithCompanyOut[];
  total: number;
  page: number;
  page_size: number;
};

export function extractSignals(organisationId: string): Promise<SignalExtractResult> {
  return apiPost<SignalExtractResult>(`/organisations/${organisationId}/signals/extract`);
}

export function rescoreSignals(organisationId: string): Promise<SignalRescoreResult> {
  return apiPost<SignalRescoreResult>(`/organisations/${organisationId}/signals/rescore`);
}

export function listSignals(
  organisationId: string,
  params: { page?: number; page_size?: number; category?: string } = {},
): Promise<SignalListOut> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));
  if (params.category) query.set("category", params.category);
  const qs = query.toString();
  return apiGet<SignalListOut>(`/organisations/${organisationId}/signals${qs ? `?${qs}` : ""}`);
}

export function getSignalById(organisationId: string, signalId: string): Promise<SignalWithCompanyOut> {
  return apiGet<SignalWithCompanyOut>(`/organisations/${organisationId}/signals/detail/${signalId}`);
}

export function getSignals(organisationId: string, companyId: string): Promise<SignalOut[]> {
  return apiGet<SignalOut[]>(`/organisations/${organisationId}/signals/${companyId}`);
}

export type SignalCategoryCount = {
  signal_category: string;
  count: number;
  company_count: number;
  avg_confidence: number | null;
};

export type SignalTrendPoint = {
  date: string;
  total: number;
  high: number;
  medium: number;
  low: number;
};

export type ConfidenceBucketCount = {
  bucket: string;
  count: number;
};

export type CountryCount = {
  country: string;
  count: number;
};

export type SourceCount = {
  source: string;
  count: number;
};

export type SignalStatsOut = {
  total: number;
  high_intent: number;
  medium_intent: number;
  low_intent: number;
  company_count: number;
  avg_confidence: number | null;
  executives_impacted: number;
  actionable_count: number;
  by_category: SignalCategoryCount[];
  trend: SignalTrendPoint[];
  top_signals: SignalWithCompanyOut[];
  histogram: ConfidenceBucketCount[];
  by_country: CountryCount[];
  by_source: SourceCount[];
};

export function getSignalStats(organisationId: string): Promise<SignalStatsOut> {
  return apiGet<SignalStatsOut>(`/organisations/${organisationId}/signals/stats`);
}
