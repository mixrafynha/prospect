import type { InstagramInfo } from "./types";

const IG_REGEX = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{2,30})\/?/gi;
const BAD_USERNAMES = new Set(["p", "reel", "reels", "stories", "explore", "accounts", "about", "developer", "privacy", "legal", "terms", "directory"]);
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || process.env.GOOGLE_SEARCH_ENGINE_ID || "";

type FetchResult = { html: string; finalUrl: string };

function normalizeWebsite(url: string) {
  const clean = String(url || "").trim();
  if (!clean) return "";
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

function cityFromAddress(address?: string) {
  return String(address || "").split(",").map((part) => part.trim()).filter(Boolean).slice(-2).join(" ");
}

function cleanUsername(username: string) {
  const value = username.replace(/^@/, "").replace(/\/$/, "").trim();
  if (!value || BAD_USERNAMES.has(value.toLowerCase())) return null;
  if (/\.php|\.html|\.aspx|\.jpg|\.png/i.test(value)) return null;
  return value;
}

function findInstagramInText(text: string, source: InstagramInfo["source"]): InstagramInfo | null {
  const matches = [...String(text || "").matchAll(IG_REGEX)];
  for (const match of matches) {
    const username = cleanUsername(match[1] || "");
    if (!username) continue;
    return { username, url: `https://www.instagram.com/${username}/`, followers: null, source };
  }

  const handle = String(text || "").match(/(?:instagram|insta|ig)[^@A-Za-z0-9._]{0,30}@([A-Za-z0-9._]{2,30})/i)?.[1];
  const username = handle ? cleanUsername(handle) : null;
  return username ? { username, url: `https://www.instagram.com/${username}/`, followers: null, source } : null;
}

function extractLikelyLinks(html: string, website: string) {
  const hrefs = [...String(html || "").matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]).filter(Boolean);
  return Array.from(new Set(hrefs.map((href) => {
    try { return new URL(href, website).toString(); } catch { return null; }
  }).filter(Boolean) as string[]));
}

async function fetchText(url: string, timeoutMs = 7000): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; WeakSiteFinder/2.0; +https://example.com)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
    });
    if (!response.ok) return { html: "", finalUrl: url };
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return { html: "", finalUrl: response.url || url };
    return { html: await response.text(), finalUrl: response.url || url };
  } catch {
    return { html: "", finalUrl: url };
  } finally {
    clearTimeout(timeout);
  }
}

async function findViaContactAndSocialPages(website: string, homepage: string) {
  const links = extractLikelyLinks(homepage, website);
  const priority = links.filter((url) => /instagram\.com|contact|contactez|reservation|rdv|rendez-vous|about|a-propos|social|mentions/i.test(url));
  const manual = ["/contact", "/contactez-nous", "/contacts", "/reservation", "/rendez-vous", "/rdv", "/about", "/a-propos"]
    .map((path) => {
      try { return new URL(path, website).toString(); } catch { return null; }
    })
    .filter(Boolean) as string[];

  for (const url of Array.from(new Set([...priority, ...manual])).slice(0, 12)) {
    if (/instagram\.com/i.test(url)) {
      const direct = findInstagramInText(url, "website");
      if (direct) return direct;
    }
    const { html } = await fetchText(url, 4500);
    const found = findInstagramInText(html, /contact|rdv|reservation|about|a-propos/i.test(url) ? "contact-page" : "website");
    if (found) return found;
  }
  return null;
}

async function findViaGoogleCustomSearch(input: { name?: string; address?: string }) {
  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID || !input.name) return null;
  try {
    const query = `site:instagram.com ${input.name} ${cityFromAddress(input.address)}`.trim();
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", GOOGLE_API_KEY);
    url.searchParams.set("cx", GOOGLE_CSE_ID);
    url.searchParams.set("q", query);
    url.searchParams.set("num", "3");
    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    const candidates = [data?.items?.[0]?.link, data?.items?.[1]?.link, data?.items?.[2]?.link, data?.items?.[0]?.formattedUrl, data?.items?.[0]?.snippet].filter(Boolean).join("\n");
    const found = findInstagramInText(candidates, "google");
    return found;
  } catch {
    return null;
  }
}

export async function findInstagramForLead(input: { website?: string; name?: string; address?: string }): Promise<InstagramInfo> {
  const website = normalizeWebsite(input.website || "");
  if (!website) return { username: null, url: null, followers: null, source: null };

  const { html: homepage, finalUrl } = await fetchText(website);
  const foundHome = findInstagramInText(`${finalUrl}\n${homepage}`, "website");
  if (foundHome) return foundHome;

  const foundContact = await findViaContactAndSocialPages(website, homepage);
  if (foundContact) return foundContact;

  const foundGoogle = await findViaGoogleCustomSearch(input);
  if (foundGoogle) return foundGoogle;

  return { username: null, url: null, followers: null, source: null };
}

export function extractInstagramFromHtml(html: string): InstagramInfo {
  return findInstagramInText(html, "website") || { username: null, url: null, followers: null, source: null };
}
