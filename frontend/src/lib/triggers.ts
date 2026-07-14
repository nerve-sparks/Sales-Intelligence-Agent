/* Lightweight localStorage store for user-created triggers (dummy persistence). */

export type SavedTrigger = {
  id: string;
  name: string;
  category: string;
  description: string;
  status: "active" | "draft";
};

const KEY = "xsparks_triggers";

export function getTriggers(): SavedTrigger[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as SavedTrigger[];
  } catch {
    return [];
  }
}

export function addTrigger(trigger: SavedTrigger): void {
  if (typeof window === "undefined") {
    return;
  }
  const list = getTriggers();
  list.unshift(trigger);
  window.localStorage.setItem(KEY, JSON.stringify(list));
}
