/* Mirrors backend/app/routes/users.py */
import { apiPost } from "./client";

export type UserOut = {
  user_id: string;
  organisation_id: string;
  email: string;
  full_name: string | null;
  created_at: string | null;
};

export type UserCreate = {
  email: string;
  full_name?: string | null;
};

export function createUser(organisationId: string, payload: UserCreate): Promise<UserOut> {
  return apiPost<UserOut>(`/organisations/${organisationId}/users`, payload);
}
