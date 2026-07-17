import { CircleDollarSign, Cloud, Layers, Rocket, UserPlus, Wrench, type LucideIcon } from "lucide-react";

/* Real signal_category values from backend/app/services/signal_extractor.py's
 * SIGNAL_CATEGORY_MAP - the only 6 values the Trigger Editor and Trigger
 * Library both let a user act on (the map has two more - company_identity,
 * reachability - but those are enrichment/firmographic categories, not
 * buying-intent categories, so they're not offered as trigger targets).
 * Single source of truth so every page that shows or filters by category
 * agrees on the same labels, descriptions, and icons. */
export const SIGNAL_CATEGORY_OPTIONS = [
  "ai_seriousness",
  "ai_pain_points",
  "buying_stage",
  "budget_and_capital",
  "urgency_and_catalysts",
  "competitive_context",
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  ai_seriousness: "AI Seriousness",
  ai_pain_points: "AI Pain Points",
  buying_stage: "Buying Stage",
  budget_and_capital: "Budget & Capital",
  urgency_and_catalysts: "Urgency & Catalysts",
  competitive_context: "Competitive Context",
};

export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  ai_seriousness: "AI hiring, budget, and tooling signals - job postings, budget announcements, pilots, and partnerships.",
  ai_pain_points: "Operational strain AI could address - inefficiency, quality issues, supply chain and labour shortages.",
  buying_stage: "Active procurement motion - RFPs, vendor evaluations, pilots in progress, and awarded contracts.",
  budget_and_capital: "Fresh capital and budget events - funding rounds, PE investment, acquisitions, IPOs.",
  urgency_and_catalysts: "Leadership changes and forcing events - new CEO/CTO/CFO, regulatory change, mergers, expansion.",
  competitive_context: "Vendor landscape signals - existing vendors mentioned, replacement signals, competitive evaluation.",
};

export type CategoryStyle = { icon: LucideIcon; color: string; bg: string };

export const CATEGORY_STYLE: Record<string, CategoryStyle> = {
  ai_seriousness: { icon: Rocket, bg: "#fff1e8", color: "#f97316" },
  ai_pain_points: { icon: Wrench, bg: "#fee2e2", color: "#ef4444" },
  buying_stage: { icon: Layers, bg: "#dcfce7", color: "#16a34a" },
  budget_and_capital: { icon: CircleDollarSign, bg: "#f3e8ff", color: "#7c3aed" },
  urgency_and_catalysts: { icon: UserPlus, bg: "#fce7f3", color: "#db2777" },
  competitive_context: { icon: Cloud, bg: "#e0f2fe", color: "#0284c7" },
};

export const DEFAULT_CATEGORY_STYLE: CategoryStyle = { icon: Layers, bg: "#eef1ff", color: "#4f46e5" };

/* Flat palette for category donuts/legends that need a color per category
 * but don't need the icon (e.g. Signal Intelligence's "Signals by Category"
 * donut, Signal Analytics' donut) - cycles if there are ever more than 6. */
export const CATEGORY_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#7c3aed", "#94a3b8"];

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}

export function categoryStyle(category: string): CategoryStyle {
  return CATEGORY_STYLE[category] ?? DEFAULT_CATEGORY_STYLE;
}
