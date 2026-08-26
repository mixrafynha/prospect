import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { PhoneNumberData, PhoneType } from "@/lib/types";

const PHONE_REGEX = /(?:(?:\+|00)\s*33(?:\s*\(0\))?[\s.-]*)?(?:0[\s.-]*)?[1-9](?:[\s.-]*\d{2}){4}/g;

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function digitsOnly(value: string) {
  return value.replace(/\D+/g, "");
}

function normalizeExtractedInput(input: string) {
  const trimmed = compact(input).replace(/[)\].,;:!?]+$/g, "");
  if (!trimmed) return null;
  let normalized = trimmed.replace(/\u00A0/g, " ");
  normalized = normalized.replace(/\(0\)/g, "");
  normalized = normalized.replace(/\s+/g, "");
  normalized = normalized.replace(/-/g, "").replace(/\./g, "");
  if (normalized.startsWith("0033")) {
    normalized = `+${normalized.slice(2)}`;
  }
  if (normalized.startsWith("+330")) {
    normalized = `+33${normalized.slice(4)}`;
  }
  if (normalized.startsWith("+33") && normalized.length >= 4 && normalized[3] !== "0") {
    return normalized;
  }
  if (normalized.startsWith("0") && normalized.length >= 10) {
    return `+33${normalized.slice(1)}`;
  }
  if (/^\d{9}$/.test(normalized)) {
    return `+33${normalized}`;
  }
  return normalized;
}

function classifyNational(national: string): PhoneType {
  const first = national[0];
  if (first === "6" || first === "7") return "mobile";
  if (["1", "2", "3", "4", "5"].includes(first)) return "landline";
  if (first === "9") return "non-geographic";
  if (first === "8") return "special";
  return "unknown";
}

function typeFromLibPhoneNumber(value: ReturnType<typeof parsePhoneNumberFromString> | null, fallbackNational: string): PhoneType {
  if (!value) return classifyNational(fallbackNational);
  const type = value.getType();
  if (type === "MOBILE" || type === "FIXED_LINE_OR_MOBILE") return "mobile";
  if (type === "FIXED_LINE") return "landline";
  if (type === "TOLL_FREE" || type === "VOIP") return "non-geographic";
  if (type === "PREMIUM_RATE" || type === "PAGER" || type === "SHARED_COST" || type === "UAN") return "special";
  return classifyNational(fallbackNational);
}

export function normalizeFrenchPhone(rawPhone: string, source: PhoneNumberData["source"], sourceUrl: string | null): PhoneNumberData | null {
  const original = compact(rawPhone);
  if (!original) return null;

  const parsed = parsePhoneNumberFromString(original, "FR");
  const normalizedE164 = parsed?.isValid() ? parsed.number : null;
  const national = parsed?.isValid() ? parsed.formatNational() : null;
  const cleanNational = national ? national.replace(/\s+/g, " ").trim() : null;
  const fallbackCandidate = normalizeExtractedInput(original);
  const nationalDigits = parsed?.nationalNumber || (fallbackCandidate ? digitsOnly(fallbackCandidate.replace(/^\+33/, "0")) : "");

  const normalizedNational = cleanNational || (normalizedE164 ? `0${nationalDigits}` : null);
  const valid = Boolean(parsed?.isValid() && normalizedE164);
  const type = valid ? typeFromLibPhoneNumber(parsed, nationalDigits) : classifyNational(nationalDigits);
  const prefix = nationalDigits ? nationalDigits.slice(0, 2) : null;

  return {
    original,
    normalizedNational,
    normalizedE164,
    type: valid ? type : "invalid",
    prefix,
    valid,
    source,
    sourceUrl,
    isMobile: valid && type === "mobile",
  };
}

export function findPhonesInText(html: string, source: PhoneNumberData["source"], sourceUrl: string | null) {
  const matches = html.match(PHONE_REGEX) || [];
  const normalized = matches
    .map((value) => normalizeFrenchPhone(value, source, sourceUrl))
    .filter((value): value is PhoneNumberData => Boolean(value));

  const deduped = new Map<string, PhoneNumberData>();
  for (const phone of normalized) {
    const key = phone.normalizedE164 || phone.original.toLowerCase();
    if (!deduped.has(key)) deduped.set(key, phone);
  }
  return Array.from(deduped.values());
}

export function dedupePhones(phones: PhoneNumberData[]) {
  const deduped = new Map<string, PhoneNumberData>();
  for (const phone of phones) {
    if (!phone.valid || !phone.normalizedE164) continue;
    const key = phone.normalizedE164 || phone.original.toLowerCase();
    if (!deduped.has(key)) deduped.set(key, phone);
  }
  return Array.from(deduped.values());
}
