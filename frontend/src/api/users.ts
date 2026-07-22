/* Mirrors backend/app/routes/users.py */
import { apiPost, apiPut } from "./client";

export type UserOut = {
  user_id: string;
  organisation_id: string;
  email: string;
  full_name: string | null;
  designation: string | null;
  created_at: string | null;
};

export type UserCreate = {
  email: string;
  full_name?: string | null;
  designation?: string | null;
};

export type UserUpdate = {
  full_name?: string | null;
  designation?: string | null;
};

export function createUser(organisationId: string, payload: UserCreate): Promise<UserOut> {
  return apiPost<UserOut>(`/organisations/${organisationId}/users`, payload);
}

/* Self-edit only - the backend checks the caller's own verified identity
 * matches userId, so this can never update a teammate's profile. */
export function updateUser(organisationId: string, userId: string, payload: UserUpdate): Promise<UserOut> {
  return apiPut<UserOut>(`/organisations/${organisationId}/users/${userId}`, payload);
}
