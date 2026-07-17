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
