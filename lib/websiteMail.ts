const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BAD_PREFIXES = ["example@", "test@", "email@", "nom@", "name@", "your@"];
const BAD_DOMAINS = ["example.com", "sentry.io", "wixpress.com", "schema.org"];

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

export function extractEmailsFromHtml(html: string) {
  const matches = html.match(EMAIL_REGEX) || [];
  return Array.from(new Set(matches.map(cleanEmail).filter(isValidLeadEmail)));
}
