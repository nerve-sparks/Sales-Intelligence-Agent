/* Mirrors backend/app/routes/signals.py - Signal Intelligence backed by
 * BuyingEvent (brief item 15), the active evidence pipeline. extractSignals/
 * rescoreSignals are legacy no-ops kept for backward compatibility only. */
import { apiGet, apiPost } from "./client";
import type { EvidenceSource } from "./scores";

export type SignalOut = {
  buying_event_id: string;
  company_id: string;
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

/** @deprecated inert - nothing populates CompanyNews/CompanyScoop anymore; the
 * active pipeline researches via Tavily directly into BuyingEvent. */
export function extractSignals(organisationId: string): Promise<SignalExtractResult> {
  return apiPost<SignalExtractResult>(`/organisations/${organisationId}/signals/extract`);
}

/** @deprecated inert - see extractSignals. */
export function rescoreSignals(organisationId: string): Promise<SignalRescoreResult> {
  return apiPost<SignalRescoreResult>(`/organisations/${organisationId}/signals/rescore`);
}

export function listSignals(
  organisationId: string,
  /* Every sort is DESCENDING server-side (backend SORT_KEYS) - a signal feed is
   * read strongest/newest first, so an ascending option would only ever surface
   * the stalest or weakest evidence. */
  params: {
    page?: number;
    page_size?: number;
    category?: string;
    import_batch_id?: string;
    event_type?: string;
    min_score?: number;
    sector?: string;
    sort?: "date" | "score" | "company";
  } = {},
): Promise<SignalListOut> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));
  if (params.category) query.set("category", params.category);
  if (params.import_batch_id) query.set("import_batch_id", params.import_batch_id);
  if (params.event_type) query.set("event_type", params.event_type);
  if (params.min_score !== undefined) query.set("min_score", String(params.min_score));
  if (params.sector) query.set("sector", params.sector);
  if (params.sort) query.set("sort", params.sort);
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
  signal_category: string | null;
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
  high_relevance: number;
  medium_relevance: number;
  low_relevance: number;
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

export function getSignalStats(organisationId: string, importBatchId?: string): Promise<SignalStatsOut> {
  const qs = importBatchId ? `?import_batch_id=${importBatchId}` : "";
  return apiGet<SignalStatsOut>(`/organisations/${organisationId}/signals/stats${qs}`);
}
