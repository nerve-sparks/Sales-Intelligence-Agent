/* Mirrors backend/app/routes/icp.py */
import { apiDelete, apiGet, apiPost, apiPut } from "./client";

export type IcpOut = {
  icp_id: string;
  name: string | null;
  industries: string[] | null;
  employee_min: number | null;
  employee_max: number | null;
  revenue_min_usd: number | null;
  revenue_max_usd: number | null;
  countries: string[] | null;
  technologies: string[] | null;
  buying_committee_personas: string[] | null;
  departments: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

export type IcpCreate = {
  name?: string | null;
  industries?: string[] | null;
  employee_min?: number | null;
  employee_max?: number | null;
  revenue_min_usd?: number | null;
  revenue_max_usd?: number | null;
  countries?: string[] | null;
  technologies?: string[] | null;
  buying_committee_personas?: string[] | null;
  departments?: string[] | null;
};

export type DecisionMakerOut = {
  decision_maker_id: string;
  company_id: string;
  zi_person_id: number;
  first_name: string | null;
  last_name: string | null;
  picture_url: string | null;
  job_title: string | null;
  department: string | null;
  years_of_experience: string | null;
  persona: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  linkedin_url: string | null;
};

export type CompanyOut = {
  company_id: string;
  zi_company_id: number;
  company_name: string;
  company_domain: string | null;
  company_type: string | null;
  company_status: string | null;
  is_verified: boolean | null;
  employee_count: number | null;
  employee_range: string | null;
  revenue_usd: number | null;
  revenue_range: string | null;
  ownership_type: string | null;
  founded_year: string | null;
  description: string | null;
  logo_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  continent: string | null;
  primary_industry: string[] | null;
  industries: string[] | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  facebook_url: string | null;
  total_funding_amount: number | null;
  recent_funding_amount: number | null;
  recent_funding_date: string | null;
  company_funding: unknown;
  employee_growth: unknown;
  competitors: unknown;
  technologies: string[] | null;
  products: string[] | null;
  decision_makers?: DecisionMakerOut[];
};

export type IcpCompaniesOut = {
  icp: IcpOut;
  match_count: number;
  companies: CompanyOut[];
};

export type ImportBatchOut = {
  import_batch_id: string;
  icp_id: string;
  icp_name: string | null;
  file_names: string[] | null;
  files_processed: number;
  total_rows: number;
  companies_ingested: number;
  signals_extracted: number;
  matched_icp_count: number;
  active_count: number;
  nurture_count: number;
  created_at: string | null;
};

export function createIcp(workspaceId: string, payload: IcpCreate): Promise<IcpOut> {
  return apiPost<IcpOut>(`/workspaces/${workspaceId}/icp`, payload);
}

/* Full-replace update (PUT) - the Settings edit form submits every field, so
 * an omitted field means "clear it", not "leave unchanged". */
export function updateIcp(workspaceId: string, icpId: string, payload: IcpCreate): Promise<IcpOut> {
  return apiPut<IcpOut>(`/workspaces/${workspaceId}/icp/${icpId}`, payload);
}

/* Deletes the ICP and (via the FK's ON DELETE CASCADE) its upload-history
 * rows. Companies/signals/scores are organisation-scoped and untouched. */
export function deleteIcp(workspaceId: string, icpId: string): Promise<void> {
  return apiDelete<void>(`/workspaces/${workspaceId}/icp/${icpId}`);
}

export function listIcps(workspaceId: string): Promise<IcpOut[]> {
  return apiGet<IcpOut[]>(`/workspaces/${workspaceId}/icp`);
}

export function getIcpCompanies(workspaceId: string, icpId: string): Promise<IcpCompaniesOut> {
  return apiGet<IcpCompaniesOut>(`/workspaces/${workspaceId}/icp/${icpId}/companies`);
}

/* Every upload ever made against any ICP in this workspace, newest first -
 * the persisted audit trail for the Settings > ICP Data page. */
export function listImportBatches(workspaceId: string): Promise<ImportBatchOut[]> {
  return apiGet<ImportBatchOut[]>(`/workspaces/${workspaceId}/icp/imports`);
}
