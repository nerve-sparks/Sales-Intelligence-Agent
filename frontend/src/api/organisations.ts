/* Mirrors backend/app/routes/organisations.py */
import { apiGet, apiPost, apiPut } from "./client";

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
  // XSparks Offering Profile (brief sections 5, 6)
  offering_profile: OfferingProfile | null;
  offering_profile_source_url: string | null;
  offering_profile_status: string | null;
  offering_profile_synced_at: string | null;
  created_at: string | null;
};

export type OfferingItem = {
  name: string;
  problems_solved?: string[];
  technologies?: string[];
  buying_signals?: string[];
};

export type OfferingProfile = {
  company: string;
  source_url?: string;
  positioning?: string;
  offerings: OfferingItem[];
  problems_solved?: string[];
  relevant_technologies?: string[];
  alternative_solutions?: { category: string; inferred?: boolean }[];
  accelerators?: string[];
  synced_at?: string | null;
  version?: number;
};

export type OfferingProfileSyncOut = {
  status: string;
  profile: OfferingProfile;
};

export function syncOfferingProfile(organisationId: string): Promise<OfferingProfileSyncOut> {
  return apiPost<OfferingProfileSyncOut>(`/organisations/${organisationId}/offering-profile/sync`);
}

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

/* Deliberately narrower than OrganisationCreate - mirrors what Settings'
 * Organization panel actually shows/edits (same fields as onboarding's
 * trimmed Organization Setup form). Omitted fields (timezone/currency/
 * employee_count_range/etc - still real columns, just no longer collected
 * anywhere) are left untouched server-side (see OrganisationUpdate's
 * exclude_unset in the controller). */
export type OrganisationUpdate = {
  company_name?: string | null;
  website?: string | null;
  legal_business_name?: string | null;
  industry?: string | null;
  headquarters_location?: string | null;
  company_description?: string | null;
  account_logo_url?: string | null;
};

export function createOrganisation(payload: OrganisationCreate): Promise<OrganisationOut> {
  return apiPost<OrganisationOut>("/organisations", payload);
}

export function getOrganisation(organisationId: string): Promise<OrganisationOut> {
  return apiGet<OrganisationOut>(`/organisations/${organisationId}`);
}

export function updateOrganisation(organisationId: string, payload: OrganisationUpdate): Promise<OrganisationOut> {
  return apiPut<OrganisationOut>(`/organisations/${organisationId}`, payload);
}
