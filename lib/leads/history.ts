import type { LeadHistoryAction, LeadHistoryItem } from "./types";

export function createHistoryItem(action: LeadHistoryAction, label: string): LeadHistoryItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    label,
    date: new Date().toISOString(),
  };
}
