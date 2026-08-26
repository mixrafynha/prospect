import type { CrmLead, LeadStatus } from "./types";
import { createHistoryItem } from "./history";

export const CRM_STORAGE_KEY = "weak-site-finder.crm.leads.v4";
export const OLD_CRM_STORAGE_KEYS = ["weak-site-finder.crm.leads.v3", "weak-site-finder.crm.leads.v2", "weak-site-finder.crm.leads.v1"];
export const PIPELINE_INDEX_KEY = "weak-site-finder.pipeline.index.v1";

function isBrowser() {
  return typeof window !== "undefined";
}

function onlyWebsiteLeads(leads: CrmLead[]) {
  return leads.filter((lead) => Boolean(lead.website && /^https?:\/\//i.test(lead.website)));
}

export function loadCrmLeads(): CrmLead[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(CRM_STORAGE_KEY) || OLD_CRM_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    const parsed = raw ? JSON.parse(raw) : [];
    const leads = Array.isArray(parsed) ? parsed : [];
    const clean = onlyWebsiteLeads(leads);
    if (clean.length !== leads.length) saveCrmLeads(clean);
    return clean;
  } catch {
    return [];
  }
}

export function saveCrmLeads(leads: CrmLead[]) {
  if (!isBrowser()) return;
  localStorage.setItem(CRM_STORAGE_KEY, JSON.stringify(onlyWebsiteLeads(leads)));
}

export function upsertCrmLeads(nextLeads: CrmLead[]) {
  const current = loadCrmLeads();
  const byId = new Map(current.map((lead) => [lead.id, lead]));

  for (const lead of onlyWebsiteLeads(nextLeads)) {
    const existing = byId.get(lead.id);
    byId.set(lead.id, existing ? {
      ...existing,
      ...lead,
      status: existing.status || lead.status,
      notes: existing.notes?.length ? existing.notes : lead.notes,
      tags: Array.from(new Set([...(existing.tags || []), ...(lead.tags || [])])),
      history: existing.history?.length ? existing.history : lead.history,
      contactedAt: existing.contactedAt || lead.contactedAt,
    } : lead);
  }

  const merged = Array.from(byId.values()).sort((a, b) => b.weakScore - a.weakScore);
  saveCrmLeads(merged);
  return merged;
}

export function updateLeadStatus(id: string, status: LeadStatus) {
  const leads = loadCrmLeads();
  const updated = leads.map((lead) => {
    if (lead.id !== id) return lead;
    const now = new Date().toISOString();
    return {
      ...lead,
      status,
      contactedAt: ["contacted", "replied", "interested", "client"].includes(status) && !lead.contactedAt ? now : lead.contactedAt,
      lastAction: `Status: ${status}`,
      updatedAt: now,
      history: [...(lead.history || []), createHistoryItem("status_changed", `Status alterado para ${status}`)],
    };
  });
  saveCrmLeads(updated);
  return updated;
}

export function registerLeadAction(id: string, action: "copied_message" | "opened_instagram", label: string, nextStatus?: LeadStatus) {
  const leads = loadCrmLeads();
  const updated = leads.map((lead) => {
    if (lead.id !== id) return lead;
    const now = new Date().toISOString();
    const status = nextStatus || lead.status;
    return {
      ...lead,
      status,
      contactedAt: ["contacted", "replied", "interested", "client"].includes(status) && !lead.contactedAt ? now : lead.contactedAt,
      lastAction: label,
      updatedAt: now,
      history: [...(lead.history || []), createHistoryItem(action, label)],
    };
  });
  saveCrmLeads(updated);
  return updated;
}

export function updateLeadNotes(id: string, notes: string[]) {
  const leads = loadCrmLeads();
  const updated = leads.map((lead) => lead.id === id ? { ...lead, notes, updatedAt: new Date().toISOString() } : lead);
  saveCrmLeads(updated);
  return updated;
}

export function updateLeadTags(id: string, tags: string[]) {
  const leads = loadCrmLeads();
  const updated = leads.map((lead) => lead.id === id ? { ...lead, tags, updatedAt: new Date().toISOString() } : lead);
  saveCrmLeads(updated);
  return updated;
}

export function getPipelineIndex() {
  if (!isBrowser()) return 0;
  return Number(localStorage.getItem(PIPELINE_INDEX_KEY) || 0) || 0;
}

export function setPipelineIndex(index: number) {
  if (!isBrowser()) return;
  localStorage.setItem(PIPELINE_INDEX_KEY, String(index));
}
