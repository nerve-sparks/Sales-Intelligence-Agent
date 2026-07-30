/* Mirrors backend/app/routes/triggers.py */
import { apiDelete, apiGet, apiPost } from "./client";

/* A trigger matches BuyingEvent.category + a minimum real event_score - the
 * same values the scoring pipeline computes (see backend
 * trigger_matcher.py's module docstring). The old signal_types field is gone:
 * it targeted a vocabulary the evidence pipeline never produces, so those
 * triggers silently matched nothing. */
export type TriggerOut = {
  trigger_id: string;
  name: string | null;
  signal_categories: string[] | null;
  min_event_score: number;
  last_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type TriggerCreate = {
  name?: string | null;
  signal_categories?: string[] | null;
  min_event_score?: number;
};

export type TriggerEventOut = {
  trigger_event_id: string;
  trigger_id: string;
  company_id: string;
  company_name: string;
  buying_event_id: string;
  event_type: string;
  category: string | null;
  title: string | null;
  summary: string | null;
  event_score: number | null;
  published_at: string | null;
  /* Matched after the user last viewed this trigger (server-computed against
   * TriggerDefinition.last_seen_at). */
  is_new: boolean;
  notified: boolean;
  detected_at: string | null;
};

export type TriggerEventsOut = {
  trigger: TriggerOut;
  event_count: number;
  new_event_count: number;
  company_count: number;
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

/* Clears this trigger's "new matches" badge. Separate from getTriggerEvents on
 * purpose - Trigger Library fetches events for every trigger just to render
 * counts, so clearing there would wipe every badge on page load. */
export function markTriggerSeen(workspaceId: string, triggerId: string): Promise<{ marked_seen: boolean }> {
  return apiPost<{ marked_seen: boolean }>(`/workspaces/${workspaceId}/triggers/${triggerId}/mark-seen`);
}

export function deleteTrigger(workspaceId: string, triggerId: string): Promise<{ deleted: boolean }> {
  return apiDelete<{ deleted: boolean }>(`/workspaces/${workspaceId}/triggers/${triggerId}`);
}

export type TriggerInsightOut = {
  summary: string;
};

/* LLM-generated (BridgeLLM, gemini/gemini-2.5-pro) - see
 * backend/app/controllers/triggers.py::insight. Falls back to a plain
 * real-numbers sentence server-side if LLM_API_KEY isn't configured. */
export function getTriggerInsight(workspaceId: string): Promise<TriggerInsightOut> {
  return apiGet<TriggerInsightOut>(`/workspaces/${workspaceId}/triggers/insight`);
}
