/* Mirrors backend/app/routes/companies.py */
import { apiGet, apiGetForBlob } from "./client";
import type { CompanyOut, DecisionMakerOut } from "./icp";

export type CompanyListItemOut = {
  company_id: string;
  company_name: string;
  company_domain: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  employee_count: number | null;
  employee_range: string | null;
  revenue_usd: number | null;
  revenue_range: string | null;
  industries: string[] | null;
  logo_url: string | null;
  lead_score: number | null;
  sales_status: string | null;
  confidence_label: string | null;
  buying_evidence_score: number | null;
  contact_access_score: number | null;
  negative_event_score: number | null;
  best_offering: string | null;
  why_now: string | null;
  expected_deal_value_usd: number | null;
};

export type CompanyListOut = {
  items: CompanyListItemOut[];
  total: number;
  page: number;
  page_size: number;
};

export function listCompanies(
  organisationId: string,
  params: { page?: number; page_size?: number; search?: string; import_batch_id?: string } = {},
): Promise<CompanyListOut> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));
  if (params.search) query.set("search", params.search);
  if (params.import_batch_id) query.set("import_batch_id", params.import_batch_id);
  const qs = query.toString();
  return apiGet<CompanyListOut>(`/organisations/${organisationId}/companies${qs ? `?${qs}` : ""}`);
}

export type CountryLeadScoreOut = {
  country: string;
  avg_lead_score: number;
  company_count: number;
  /* The Dashboard globe colors by this, not avg_lead_score - see
   * company_directory.lead_score_by_country: a large mixed population can
   * average into "Monitor" while still holding genuinely Sales Ready
   * companies. */
  max_lead_score: number;
};

export type SectorCountOut = {
  sector: string;
  companies: number;
  scored: number;
  sales_ready: number;
};

export type CompanyStatsOut = {
  total: number;
  scored: number;
  unscored: number;
  sales_ready: number;
  high_priority: number;
  warm: number;
  monitor: number;
  low_priority: number;
  high_confidence: number;
  provisional_pipeline_value: number;
  by_country: CountryLeadScoreOut[];
  /* Industry SECTORS with counts, rolled up server-side from
   * Company.primary_industry (backend/app/core/industry_sectors.py). Sent from
   * the API rather than mapped here so the taxonomy lives in exactly one place -
   * the raw industry column is far too skewed to filter on directly ("Software"
   * alone is ~73% of classified companies). */
  by_sector: SectorCountOut[];
};

/* importBatchId narrows every count to companies from one specific Excel
 * upload (Dashboard timeline picker) instead of everything ever ingested. */
export function getCompanyStats(
  organisationId: string,
  importBatchId?: string,
  sector?: string,
): Promise<CompanyStatsOut> {
  const params = new URLSearchParams();
  if (importBatchId) params.set("import_batch_id", importBatchId);
  /* `sector` narrows by_country (so the globe actually re-colours) but NOT
   * by_sector, so the dropdown keeps listing every sector with its real total
   * instead of collapsing to whichever one is selected. */
  if (sector) params.set("sector", sector);
  const qs = params.toString();
  return apiGet<CompanyStatsOut>(
    `/organisations/${organisationId}/companies/stats${qs ? `?${qs}` : ""}`,
  );
}

export type CompanyInsightOut = {
  summary: string;
};

/* LLM-generated (BridgeLLM, gemini/gemini-2.5-pro) - see
 * backend/app/services/llm_client.py. Falls back to a plain real-numbers
 * sentence server-side if LLM_API_KEY isn't configured, so this never
 * throws just because the key is missing. */
export function getCompanyInsight(organisationId: string): Promise<CompanyInsightOut> {
  return apiGet<CompanyInsightOut>(`/organisations/${organisationId}/companies/insight`);
}

/* Company Directory + evidence-based score columns as an .xlsx download -
 * importBatchId narrows the export to one uploaded batch's companies, omit it
 * to export every company. */
export async function exportCompanies(organisationId: string, importBatchId?: string): Promise<Blob> {
  const qs = importBatchId ? `?import_batch_id=${importBatchId}` : "";
  const { blob } = await apiGetForBlob(`/organisations/${organisationId}/companies/export${qs}`);
  return blob;
}

export function getCompany(organisationId: string, companyId: string): Promise<CompanyOut> {
  return apiGet<CompanyOut>(`/organisations/${organisationId}/companies/${companyId}`);
}

export function listDecisionMakers(organisationId: string, companyId: string): Promise<DecisionMakerOut[]> {
  return apiGet<DecisionMakerOut[]>(`/organisations/${organisationId}/companies/${companyId}/decision-makers`);
}

export function getDecisionMaker(organisationId: string, decisionMakerId: string): Promise<DecisionMakerOut> {
  return apiGet<DecisionMakerOut>(`/organisations/${organisationId}/decision-makers/${decisionMakerId}`);
}
