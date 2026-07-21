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
  gate_status: string | null;
};

export type CompanyListOut = {
  items: CompanyListItemOut[];
  total: number;
  page: number;
  page_size: number;
};

export function listCompanies(
  organisationId: string,
  params: { page?: number; page_size?: number; search?: string } = {},
): Promise<CompanyListOut> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));
  if (params.search) query.set("search", params.search);
  const qs = query.toString();
  return apiGet<CompanyListOut>(`/organisations/${organisationId}/companies${qs ? `?${qs}` : ""}`);
}

export type CountryLeadScoreOut = {
  country: string;
  avg_lead_score: number;
  company_count: number;
};

export type CompanyStatsOut = {
  total: number;
  high_intent: number;
  medium_intent: number;
  low_intent: number;
  by_country: CountryLeadScoreOut[];
};

/* importBatchId narrows every count to companies from one specific Excel
 * upload (Dashboard timeline picker) instead of everything ever ingested. */
export function getCompanyStats(organisationId: string, importBatchId?: string): Promise<CompanyStatsOut> {
  const qs = importBatchId ? `?import_batch_id=${importBatchId}` : "";
  return apiGet<CompanyStatsOut>(`/organisations/${organisationId}/companies/stats${qs}`);
}

export type CompanyInsightOut = {
  summary: string;
};

export type IcpThresholdsOut = {
  employee_min: number | null;
  employee_max: number | null;
  revenue_min_usd: number | null;
  revenue_max_usd: number | null;
  industries: string[];
  countries: string[];
  company_count: number;
};

/* Data-driven ICP range suggestions from the org's uploaded companies (10th-
 * 90th percentile employee/revenue + most common industries/countries) - so a
 * new ICP fits the real data instead of guessed numbers that match nothing. */
export function getIcpThresholds(organisationId: string): Promise<IcpThresholdsOut> {
  return apiGet<IcpThresholdsOut>(`/organisations/${organisationId}/companies/icp-thresholds`);
}

/* LLM-generated (BridgeLLM, gemini/gemini-2.5-pro) - see
 * backend/app/services/llm_client.py. Falls back to a plain real-numbers
 * sentence server-side if LLM_API_KEY isn't configured, so this never
 * throws just because the key is missing. */
export function getCompanyInsight(organisationId: string): Promise<CompanyInsightOut> {
  return apiGet<CompanyInsightOut>(`/organisations/${organisationId}/companies/insight`);
}

/* Company Directory + real LeadScore columns as an .xlsx download - icpId
 * narrows the export to that ICP's matching companies (same filter the
 * Enterprise List's dropdown applies), omit it to export every company. */
export async function exportCompanies(organisationId: string, icpId?: string): Promise<Blob> {
  const qs = icpId ? `?icp_id=${icpId}` : "";
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
