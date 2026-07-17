/* Mirrors backend/app/routes/triggers.py */
import { apiGet, apiPost } from "./client";

export type TriggerOut = {
  trigger_id: string;
  name: string | null;
  signal_types: string[] | null;
  signal_categories: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

export type TriggerCreate = {
  name?: string | null;
  signal_types?: string[] | null;
  signal_categories?: string[] | null;
};

export type TriggerEventOut = {
  trigger_event_id: string;
  trigger_id: string;
  company_id: string;
  company_name: string;
  signal_id: string;
  signal_type: string;
  signal_category: string;
  core_fact: string | null;
  notified: boolean;
  detected_at: string | null;
};

export type TriggerEventsOut = {
  trigger: TriggerOut;
  event_count: number;
  events: TriggerEventOut[];
};

export function createTrigger(workspaceId: string, payload: TriggerCreate): Promise<TriggerOut> {
  return apiPost<TriggerOut>(`/workspaces/${workspaceId}/triggers`, payload);
}

export function listTriggers(workspaceId: string): Promise<TriggerOut[]> {
  return apiGet<TriggerOut[]>(`/workspaces/${workspaceId}/triggers`);
}

export function getTriggerEvents(workspaceId: string, triggerId: string): Promise<TriggerEventsOut> {
  return apiGet<TriggerEventsOut>(`/workspaces/${workspaceId}/triggers/${triggerId}/events`);
}
