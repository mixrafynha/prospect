const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BAD_PREFIXES = ["example@", "test@", "email@", "nom@", "name@", "your@"];
const BAD_DOMAINS = ["example.com", "sentry.io", "wixpress.com", "schema.org"];

function normalizeUrl(input: string) {
  const value = String(input || "").trim();
  if (!value) return null;
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }
}

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

async function fetchHtml(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 WeakSiteFinder/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return "";
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

export async function findEmailOnWebsite(website: string) {
  const baseUrl = normalizeUrl(website);
  if (!baseUrl) return { email: null, source: null, checked: [] as string[] };

  const paths = ["/", "/contact", "/contactez-nous", "/contacts", "/mentions-legales", "/mentions-légales", "/a-propos", "/about"];
  const checked: string[] = [];

  for (const path of paths) {
    const url = new URL(path, baseUrl.origin);
    checked.push(url.toString());
    const html = await fetchHtml(url);
    const emails = extractEmails(html);
    if (emails.length > 0) {
      return { email: emails[0], source: url.toString(), checked };
    }
  }

  return { email: null, source: null, checked };
}
