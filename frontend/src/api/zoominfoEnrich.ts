/* Mirrors backend/app/routes/zoominfo_enrich.py */
import { apiPost } from "./client";
import type { CompanyOut, DecisionMakerOut } from "./icp";

export type CompanyMatchCriteria = {
  company_name?: string | null;
  company_website?: string | null;
  zi_company_id?: number | null;
  company_ticker?: string | null;
  company_phone?: string | null;
  company_fax?: string | null;
  company_street?: string | null;
  company_city?: string | null;
  company_state?: string | null;
  company_zip_code?: string | null;
  company_country?: string | null;
  ip_address?: string | null;
};

export type ContactMatchCriteria = {
  company_id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  job_title?: string | null;
  zi_person_id?: number | null;
  hashed_email?: string | null;
  external_url?: string | null;
  last_updated_date_after?: string | null;
  valid_date_after?: string | null;
  contact_accuracy_score_min?: string | null;
  zi_company_id?: number | null;
  company_name?: string | null;
};

export type CompanyRequest = {
  company_id: string;
};

export type ScoopRequest = {
  company_id: string;
  published_start_date?: string | null;
  published_end_date?: string | null;
  updated_since_creation?: boolean | null;
  scoop_type?: string | null;
  scoop_topic?: string | null;
  department?: string | null;
  description?: string | null;
};

export type ScoopOut = {
  scoop_id: string;
  company_id: string;
  description: string | null;
  published_date: string | null;
  topics: unknown;
  types: unknown;
};

export type ScoopEnrichOut = {
  count: number;
  scoops: ScoopOut[];
};

export type NewsRequest = {
  company_id: string;
  categories?: string[] | null;
  url?: string[] | null;
  page_date_min?: string | null;
  page_date_max?: string | null;
};

export type NewsOut = {
  news_id: string;
  company_id: string;
  domain: string | null;
  title: string | null;
  description: string | null;
  category: string | null;
  page_date: string | null;
};

export type NewsEnrichOut = {
  count: number;
  news: NewsOut[];
};

export type IntentRequest = {
  company_id: string;
  topics: string[];
  signal_start_date?: string | null;
  signal_end_date?: string | null;
  signal_score_min?: number | null;
  signal_score_max?: number | null;
  audience_strength_min?: string | null;
  audience_strength_max?: string | null;
  find_recommended_contacts?: boolean | null;
};

export type IntentOut = {
  intent_id: string;
  company_id: string;
  category: string | null;
  topic: string | null;
  signal_score: number | null;
  signal_date: string | null;
  recommended_contacts: unknown;
};

export type IntentEnrichOut = {
  count: number;
  signals: IntentOut[];
};

export function enrichCompany(organisationId: string, payload: CompanyMatchCriteria): Promise<CompanyOut> {
  return apiPost<CompanyOut>(`/organisations/${organisationId}/zoominfo/companies/enrich`, payload);
}

export function enrichContact(organisationId: string, payload: ContactMatchCriteria): Promise<DecisionMakerOut> {
  return apiPost<DecisionMakerOut>(`/organisations/${organisationId}/zoominfo/contacts/enrich`, payload);
}

export function enrichScoops(organisationId: string, payload: ScoopRequest): Promise<ScoopEnrichOut> {
  return apiPost<ScoopEnrichOut>(`/organisations/${organisationId}/zoominfo/scoops/enrich`, payload);
}

export function enrichNews(organisationId: string, payload: NewsRequest): Promise<NewsEnrichOut> {
  return apiPost<NewsEnrichOut>(`/organisations/${organisationId}/zoominfo/news/enrich`, payload);
}

export function enrichIntent(organisationId: string, payload: IntentRequest): Promise<IntentEnrichOut> {
  return apiPost<IntentEnrichOut>(`/organisations/${organisationId}/zoominfo/intent/enrich`, payload);
}

export function enrichTechnologies(organisationId: string, payload: CompanyRequest): Promise<CompanyOut> {
  return apiPost<CompanyOut>(`/organisations/${organisationId}/zoominfo/technologies/enrich`, payload);
}
