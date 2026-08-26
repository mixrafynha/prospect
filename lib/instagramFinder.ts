const IG_URL_REGEX = /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]{2,30})\/?/gi;
const IG_HANDLE_REGEX = /(?:^|[\s"'@\/])instagram\.com\/([A-Za-z0-9._]{2,30})\/?/gi;

const BAD_HANDLES = new Set([
  "p",
  "reel",
  "reels",
  "stories",
  "explore",
  "accounts",
  "direct",
  "developer",
  "about",
  "legal",
  "privacy",
  "terms",
  "instagram",
]);

function normalizeUrl(input: string) {
  const value = String(input || "").trim();
  if (!value) return null;
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }
}

function cleanHandle(handle: string) {
  return String(handle || "")
    .trim()
    .replace(/^@/, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

function isGoodHandle(handle: string) {
  const h = cleanHandle(handle);
  if (!h || h.length < 2 || h.length > 30) return false;
  if (BAD_HANDLES.has(h)) return false;
  if (!/^[a-z0-9._]+$/.test(h)) return false;
  return true;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function extractInstagramHandles(html: string) {
  const handles: string[] = [];
  let match: RegExpExecArray | null;

  IG_URL_REGEX.lastIndex = 0;
  while ((match = IG_URL_REGEX.exec(html))) {
    if (match[1] && isGoodHandle(match[1])) handles.push(cleanHandle(match[1]));
  }

  IG_HANDLE_REGEX.lastIndex = 0;
  while ((match = IG_HANDLE_REGEX.exec(html))) {
    if (match[1] && isGoodHandle(match[1])) handles.push(cleanHandle(match[1]));
  }

  return unique(handles);
}

function scoreHandleForBusiness(handle: string, businessName: string, websiteHost: string) {
  const h = cleanHandle(handle).replace(/[._]/g, "");
  const name = businessName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const host = websiteHost.toLowerCase().replace(/^www\./, "").split(".")[0].replace(/[^a-z0-9]/g, "");

  let score = 0;
  if (name && h.includes(name.slice(0, Math.min(8, name.length)))) score += 3;
  if (host && h.includes(host.slice(0, Math.min(8, host.length)))) score += 3;
  if (h.length <= 18) score += 1;
  return score;
}

async function fetchHtml(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 WeakSiteFinder/1.0 InstagramDetector",
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

export function instagramUrlFromHandle(handle: string) {
  const h = cleanHandle(handle);
  return h ? `https://www.instagram.com/${h}/` : null;
}

export async function findInstagramOnWebsite(website: string, businessName = "") {
  const baseUrl = normalizeUrl(website);
  if (!baseUrl) return { handle: null, url: null, source: null, checked: [] as string[] };

  const paths = ["/", "/contact", "/contactez-nous", "/contacts", "/a-propos", "/about", "/mentions-legales", "/mentions-légales"];
  const checked: string[] = [];
  const found: Array<{ handle: string; source: string; score: number }> = [];

  for (const path of paths) {
    const url = new URL(path, baseUrl.origin);
    checked.push(url.toString());
    const html = await fetchHtml(url);
    if (!html) continue;

    const handles = extractInstagramHandles(html);
    for (const handle of handles) {
      found.push({
        handle,
        source: url.toString(),
        score: scoreHandleForBusiness(handle, businessName, baseUrl.hostname),
      });
    }
  }

  const best = found.sort((a, b) => b.score - a.score)[0];
  if (!best) return { handle: null, url: null, source: null, checked };

  return {
    handle: best.handle,
    url: instagramUrlFromHandle(best.handle),
    source: best.source,
    checked,
  };
}
