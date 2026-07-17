/* Mirrors backend/app/routes/companies.py */
import { apiGet } from "./client";
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

export function getCompany(organisationId: string, companyId: string): Promise<CompanyOut> {
  return apiGet<CompanyOut>(`/organisations/${organisationId}/companies/${companyId}`);
}

export function listDecisionMakers(organisationId: string, companyId: string): Promise<DecisionMakerOut[]> {
  return apiGet<DecisionMakerOut[]>(`/organisations/${organisationId}/companies/${companyId}/decision-makers`);
}

export function getDecisionMaker(organisationId: string, decisionMakerId: string): Promise<DecisionMakerOut> {
  return apiGet<DecisionMakerOut>(`/organisations/${organisationId}/decision-makers/${decisionMakerId}`);
}
