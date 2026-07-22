/* Mirrors backend/app/routes/workspaces.py */
import { apiGet, apiPost } from "./client";

export type WorkspaceOut = {
  workspace_id: string;
  organisation_id: string;
  workspace_name: string;
  purpose: string | null;
  created_at: string | null;
};

export type WorkspaceCreate = {
  workspace_name: string;
  purpose?: string | null;
};

export type MemberOut = {
  workspace_member_id: string;
  workspace_id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  designation: string | null;
  role: string;
  created_at: string | null;
};

export type MemberCreate = {
  user_id: string;
  role?: string;
};

export function createWorkspace(organisationId: string, payload: WorkspaceCreate): Promise<WorkspaceOut> {
  return apiPost<WorkspaceOut>(`/organisations/${organisationId}/workspaces`, payload);
}

export function listWorkspaces(organisationId: string): Promise<WorkspaceOut[]> {
  return apiGet<WorkspaceOut[]>(`/organisations/${organisationId}/workspaces`);
}

export function addWorkspaceMember(workspaceId: string, payload: MemberCreate): Promise<MemberOut> {
  return apiPost<MemberOut>(`/workspaces/${workspaceId}/members`, payload);
}

export function listWorkspaceMembers(workspaceId: string): Promise<MemberOut[]> {
  return apiGet<MemberOut[]>(`/workspaces/${workspaceId}/members`);
}
