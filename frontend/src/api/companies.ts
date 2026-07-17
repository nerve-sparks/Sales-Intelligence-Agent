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

export type CompanyStatsOut = {
  total: number;
  high_intent: number;
  medium_intent: number;
  low_intent: number;
};

export function getCompanyStats(organisationId: string): Promise<CompanyStatsOut> {
  return apiGet<CompanyStatsOut>(`/organisations/${organisationId}/companies/stats`);
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
