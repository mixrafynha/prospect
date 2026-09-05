import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { LeadStatus } from "./types";

export const OUTREACH_HISTORY_STORAGE_KEY = "weak-site-finder.crm.outreach-history.v1";

export type OutreachStatus =
  | "new"
  | "contacted"
  | "replied"
  | "interested"
  | "client"
  | "not_interested";

export type OutreachHistoryItem = {
  id: string;
  leadId: string;
  companyName: string;
  phone: string;
  normalizedPhone: string;
  website: string;
  location: string;
  preparedMessage: string;
  contactAt: string;
  status: OutreachStatus;
  leadStatus?: LeadStatus;
  messageHistory: Array<{
    id: string;
    date: string;
    message: string;
    type: "prepared" | "sent" | "reply" | "status";
  }>;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function cleanPhone(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeFrenchPhoneForSearch(rawPhone: string) {
  const original = cleanPhone(rawPhone);
  if (!original) return "";

  const parsed = parsePhoneNumberFromString(original, "FR");
  if (parsed?.isValid()) {
    return parsed.number.replace(/\D+/g, "");
  }

  const digits = original.replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("33")) return digits;
  if (digits.startsWith("0") && digits.length >= 10) return `33${digits.slice(1)}`;
  if (digits.length === 9) return `33${digits}`;
  return digits;
}

export function getFrenchPhoneVariants(rawPhone: string) {
  const normalized = normalizeFrenchPhoneForSearch(rawPhone);
  if (!normalized) return [];
  const digits = normalized.replace(/\D+/g, "");
  if (!digits) return [];
  const variants = new Set<string>([
    digits,
    `33${digits.replace(/^33/, "")}`,
    `0${digits.replace(/^33/, "")}`,
    `+${digits.startsWith("33") ? digits : `33${digits}`}`,
  ]);
  if (digits.startsWith("33") && digits.length > 2) {
    const national = digits.slice(2);
    variants.add(national);
    variants.add(`0${national}`);
    if (national.startsWith("6") || national.startsWith("7")) {
      variants.add(`+33${national}`);
    }
  }
  return Array.from(variants).filter(Boolean);
}

function storageRead(): OutreachHistoryItem[] {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(OUTREACH_HISTORY_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function storageWrite(items: OutreachHistoryItem[]) {
  if (!isBrowser()) return;
  localStorage.setItem(OUTREACH_HISTORY_STORAGE_KEY, JSON.stringify(items));
}

function historyEntry(type: OutreachHistoryItem["messageHistory"][number]["type"], message: string) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    message,
    type,
  };
}

export function loadOutreachHistory() {
  return storageRead().sort((a, b) => b.contactAt.localeCompare(a.contactAt));
}

export function saveOutreachHistory(items: OutreachHistoryItem[]) {
  storageWrite(items);
  return items;
}

export function findOutreachByPhone(rawPhone: string) {
  const variants = getFrenchPhoneVariants(rawPhone);
  if (!variants.length) return null;
  const items = storageRead();
  return items.find((item) => variants.includes(item.normalizedPhone) || variants.includes(normalizeFrenchPhoneForSearch(item.phone))) || null;
}

export function upsertOutreachContact(lead: {
  id: string;
  companyName: string;
  phone: string;
  website: string;
  location: string;
  leadStatus?: LeadStatus;
}, payload: { phone: string; message: string }) {
  const normalizedPhone = normalizeFrenchPhoneForSearch(payload.phone);
  const now = new Date().toISOString();
  const items = storageRead();
  const variants = getFrenchPhoneVariants(payload.phone);
  const existingIndex = items.findIndex((item) => item.leadId === lead.id || variants.includes(item.normalizedPhone) || variants.includes(normalizeFrenchPhoneForSearch(item.phone)));
  const current = existingIndex >= 0 ? items[existingIndex] : null;
  const sameMessageAlreadySaved = current?.preparedMessage === payload.message;

  const nextItem: OutreachHistoryItem = {
    id: current?.id || `${lead.id}-${normalizedPhone || Date.now()}`,
    leadId: lead.id,
    companyName: lead.companyName,
    phone: payload.phone,
    normalizedPhone,
    website: lead.website,
    location: lead.location,
    preparedMessage: payload.message,
    contactAt: current?.contactAt || now,
    status: current?.status || "contacted",
    leadStatus: current?.leadStatus || lead.leadStatus || "contacted",
    messageHistory: sameMessageAlreadySaved ? (current?.messageHistory || []) : [
      ...(current?.messageHistory || []),
      historyEntry("prepared", payload.message),
    ],
  };

  if (existingIndex >= 0) {
    items[existingIndex] = nextItem;
  } else {
    items.unshift(nextItem);
  }

  storageWrite(items);
  return nextItem;
}

export function updateOutreachStatus(identifier: string, status: OutreachStatus) {
  const items = storageRead();
  const variants = getFrenchPhoneVariants(identifier);
  const updated = items.map<OutreachHistoryItem>((item) => {
    if (item.id !== identifier && !variants.includes(item.normalizedPhone) && !variants.includes(normalizeFrenchPhoneForSearch(item.phone))) return item;
    return {
      ...item,
      status: status as OutreachStatus,
      messageHistory: [...item.messageHistory, historyEntry("status", `Status alterado para ${status}`)],
    };
  });
  storageWrite(updated);
  return updated;
}

export function appendOutreachReply(identifier: string, reply: string) {
  const items = storageRead();
  const variants = getFrenchPhoneVariants(identifier);
  const updated = items.map<OutreachHistoryItem>((item) => {
    if (item.id !== identifier && !variants.includes(item.normalizedPhone) && !variants.includes(normalizeFrenchPhoneForSearch(item.phone))) return item;
    return {
      ...item,
      status: "replied" as OutreachStatus,
      messageHistory: [...item.messageHistory, historyEntry("reply", reply)],
    };
  });
  storageWrite(updated);
  return updated;
}
