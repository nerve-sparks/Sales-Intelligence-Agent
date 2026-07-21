/* Mirrors backend/app/routes/organisations.py */
import { apiGet, apiPost } from "./client";

export type OrganisationOut = {
  organisation_id: string;
  account_name: string | null;
  account_url: string | null;
  account_logo_url: string | null;
  timezone: string | null;
  currency: string | null;
  company_name: string;
  website: string | null;
  legal_business_name: string | null;
  industry: string | null;
  sub_industry: string | null;
  headquarters_location: string | null;
  founded_year: string | null;
  employee_count_range: string | null;
  annual_revenue_range: string | null;
  business_type: string | null;
  company_description: string | null;
  created_at: string | null;
};

export type OrganisationCreate = {
  // Onboarding step 1 - account identity
  account_name?: string | null;
  account_url?: string | null;
  account_logo_url?: string | null;
  timezone?: string | null;
  currency?: string | null;
  // Onboarding step 2 - company profile
  company_name: string;
  website?: string | null;
  legal_business_name?: string | null;
  industry?: string | null;
  sub_industry?: string | null;
  headquarters_location?: string | null;
  founded_year?: string | null;
  employee_count_range?: string | null;
  annual_revenue_range?: string | null;
  business_type?: string | null;
  company_description?: string | null;
};

export function createOrganisation(payload: OrganisationCreate): Promise<OrganisationOut> {
  return apiPost<OrganisationOut>("/organisations", payload);
}

export function getOrganisation(organisationId: string): Promise<OrganisationOut> {
  return apiGet<OrganisationOut>(`/organisations/${organisationId}`);
}

export type IcpRecommendationOut = {
  name: string;
  industries: string[];
  employee_min: number | null;
  employee_max: number | null;
  revenue_min_usd: number | null;
  revenue_max_usd: number | null;
  countries: string[];
  rationale: string;
};

export type IcpRecommendationsOut = {
  recommendations: IcpRecommendationOut[];
};

/* LLM-generated (BridgeLLM, gemini/gemini-2.5-pro) from the organisation's
 * own profile fields - see backend/app/controllers/organisations.py::
 * icp_recommendations. Empty array (not an error) if the LLM isn't
 * configured or didn't return parseable JSON. */
export function getIcpRecommendations(organisationId: string): Promise<IcpRecommendationsOut> {
  return apiGet<IcpRecommendationsOut>(`/organisations/${organisationId}/icp-recommendations`);
}
