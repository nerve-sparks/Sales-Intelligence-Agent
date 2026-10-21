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
  // AI-identified on Offering Profile refresh - read-only; only keeps these
  // out of Find companies and drives competitor news, never changes scores.
  competitors: { name: string; domain: string | null }[] | null;
  news_refreshed_at: string | null;
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

export type WebsitePrefillOut = {
  website: string | null;
  status: string;
  organisation: Record<string, string | null | undefined>;
  offering_profile: OfferingProfile | null;
};

export function prefillFromWebsite(website: string): Promise<WebsitePrefillOut> {
  return apiPost<WebsitePrefillOut>("/organisations/prefill-from-website", { website });
}

export function seedOfferingProfile(
  organisationId: string,
  payload: { profile: OfferingProfile; source_url: string },
): Promise<OfferingProfileSyncOut> {
  return apiPost<OfferingProfileSyncOut>(`/organisations/${organisationId}/offering-profile/seed`, payload);
}

/* Organisation-wide news about the tenant's own competitors (not prospects),
 * refreshed automatically every 48h - not scoped to an upload. */
export type CompetitorNewsCategory =
  | "funding"
  | "launch"
  | "partnership"
  | "customer_win"
  | "hiring"
  | "leadership"
  | "other";

export type CompetitorNewsItem = {
  competitor_news_id: string;
  competitor_name: string;
  competitor_domain: string | null;
  title: string;
  summary: string | null;
  why_it_matters: string | null;
  category: CompetitorNewsCategory;
  url: string;
  source_domain: string | null;
  published_at: string | null;
  discovered_at: string;
};

export type CompetitorNewsListOut = {
  items: CompetitorNewsItem[];
  // Last automatic refresh; null until the scheduler has run once.
  refreshed_at: string | null;
  competitor_count: number;
};

export function listCompetitorNews(
  organisationId: string,
  params: { days?: number; limit?: number } = {},
): Promise<CompetitorNewsListOut> {
  const query = new URLSearchParams();
  if (params.days !== undefined) query.set("days", String(params.days));
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiGet<CompetitorNewsListOut>(`/organisations/${organisationId}/competitor-news${qs ? `?${qs}` : ""}`);
}

/* 202 - runs in the background; refetch listCompetitorNews afterwards. */
export function refreshCompetitorNews(organisationId: string): Promise<{ status: string }> {
  return apiPost<{ status: string }>(`/organisations/${organisationId}/competitor-news/refresh`);
}

/* Dashboard Latest News: news about the top 50 global AI companies, shared by
 * every organisation (backend ai_market_news_service), refreshed every 72h. */
export type AiNewsCategory = "product_launch" | "funding" | "press_briefing" | "buying_signal";

export type AiNewsItem = {
  ai_market_news_id: string;
  company_name: string;
  company_domain: string | null;
  title: string;
  summary: string | null;
  category: AiNewsCategory;
  url: string;
  source_domain: string | null;
  published_at: string | null;
  discovered_at: string;
};

export type AiNewsListOut = {
  items: AiNewsItem[];
  total: number;
  page: number;
  page_size: number;
  refreshed_at: string | null;
  refresh_interval_hours: number;
  company_count: number;
};

export function listAiNews(
  organisationId: string,
  params: { days?: number; page?: number; page_size?: number; category?: AiNewsCategory } = {},
): Promise<AiNewsListOut> {
  const query = new URLSearchParams();
  if (params.days !== undefined) query.set("days", String(params.days));
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.page_size !== undefined) query.set("page_size", String(params.page_size));
  if (params.category) query.set("category", params.category);
  const qs = query.toString();
  return apiGet<AiNewsListOut>(`/organisations/${organisationId}/ai-news${qs ? `?${qs}` : ""}`);
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
