import { dedupePhones, findPhonesInText } from "@/lib/phone";
import { fetchPublicHtml, safePublicUrl } from "@/lib/safeFetch";
import type { PhoneNumberData } from "@/lib/types";

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BAD_PREFIXES = ["example@", "test@", "email@", "nom@", "name@", "your@"];
const BAD_DOMAINS = ["example.com", "sentry.io", "wixpress.com", "schema.org"];
const PUBLIC_PATHS = ["/", "/contact", "/contactez-nous", "/mentions-legales", "/mentions légales", "/a-propos", "/about", "/reservation", "/réservation", "/booking"];

function cleanEmail(email: string) {
  return email.toLowerCase().replace(/^mailto:/, "").replace(/[),.;]+$/, "");
}

function isValidLeadEmail(email: string) {
  const cleaned = cleanEmail(email);
  if (!cleaned.includes("@")) return false;
  if (BAD_PREFIXES.some((p) => cleaned.startsWith(p))) return false;
  if (BAD_DOMAINS.some((d) => cleaned.endsWith(d))) return false;
  if (cleaned.includes("no-reply") || cleaned.includes("noreply")) return false;
  return true;
}

function extractEmails(html: string) {
  const matches = html.match(EMAIL_REGEX) || [];
  return Array.from(new Set(matches.map(cleanEmail).filter(isValidLeadEmail)));
}

function extractLinkedPaths(html: string, baseUrl: URL) {
  const hrefs = Array.from(html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)).map((match) => match[1]);
  return hrefs
    .map((href) => {
      try {
        return new URL(href, baseUrl);
      } catch {
        return null;
      }
    })
    .filter((url): url is URL => Boolean(url))
    .filter((url) => url.origin === baseUrl.origin)
    .map((url) => url.pathname.toLowerCase())
    .filter((path) => PUBLIC_PATHS.some((needle) => path.includes(needle.replace(/\s+/g, "-")) || path.includes(needle)));
}

function uniquePaths(paths: string[]) {
  return Array.from(new Set(paths));
}

export type WebsiteEnrichmentResult = {
  email: string | null;
  emailSource: string | null;
  checkedEmailPages: string[];
  phones: PhoneNumberData[];
  checkedPhonePages: string[];
  finalUrl: string | null;
};

export async function enrichWebsiteContacts(website: string) {
  const baseUrl = safePublicUrl(website);
  if (!baseUrl) {
    return { email: null, emailSource: null, checkedEmailPages: [], phones: [], checkedPhonePages: [], finalUrl: null };
  }

  const toCheck = uniquePaths([
    ...PUBLIC_PATHS,
  ]);
  const checkedEmailPages: string[] = [];
  const checkedPhonePages: string[] = [];
  const collectedPhones: PhoneNumberData[] = [];

  let email: string | null = null;
  let emailSource: string | null = null;
  let finalUrl: string | null = null;

  for (let index = 0; index < toCheck.length; index++) {
    const path = toCheck[index];
    const url = new URL(path, baseUrl.origin);
    const { ok, html, finalUrl: resolvedUrl } = await fetchPublicHtml(url, { timeoutMs: 7000, maxBytes: 1_000_000, maxRedirects: 2 });
    checkedEmailPages.push(url.toString());
    checkedPhonePages.push(url.toString());
    if (!ok || !html) continue;

    finalUrl = resolvedUrl;
    if (!email) {
      const emails = extractEmails(html);
      if (emails.length > 0) {
        email = emails[0];
        emailSource = url.toString();
      }
    }

    const phones = findPhonesInText(html, "website", url.toString());
    if (phones.length > 0) collectedPhones.push(...phones);

    if (!email) {
      const linkedPaths = extractLinkedPaths(html, baseUrl);
      for (const linkedPath of linkedPaths.slice(0, 6)) {
        if (toCheck.includes(linkedPath)) continue;
        toCheck.push(linkedPath);
      }
    }
  }

  return {
    email,
    emailSource,
    checkedEmailPages,
    phones: dedupePhones(collectedPhones),
    checkedPhonePages,
    finalUrl,
  };
}
