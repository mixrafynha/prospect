const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
  "metadata.google.internal",
  "169.254.169.254",
  "169.254.169.253",
]);

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isIpv6Literal(hostname: string) {
  return hostname.includes(":");
}

function isBlockedHostname(hostname: string) {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith(".local")) return true;
  if (lower.endsWith(".internal")) return true;
  if (lower.endsWith(".localhost")) return true;
  if (isIpv6Literal(lower) && (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd"))) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(lower) && isPrivateIpv4(lower)) return true;
  return false;
}

export function safePublicUrl(input: string) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (isBlockedHostname(url.hostname)) return null;
  return url;
}

export async function fetchPublicHtml(input: string | URL, options?: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number }) {
  const timeoutMs = options?.timeoutMs ?? 8000;
  const maxBytes = options?.maxBytes ?? 1_200_000;
  const maxRedirects = options?.maxRedirects ?? 3;
  let current: URL | null = typeof input === "string" ? safePublicUrl(input) : input;
  if (!current) return { ok: false, html: "", finalUrl: null as string | null };

  const headers = {
    "User-Agent": "Mozilla/5.0 WeakSiteFinder/1.0",
    Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
  };

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const requestUrl: URL = current;
      if (!requestUrl) return { ok: false, html: "", finalUrl: null as string | null };
      const response: Response = await fetch(requestUrl, {
        signal: controller.signal,
        redirect: "manual",
        cache: "no-store",
        headers,
      });

      if (response.status >= 300 && response.status < 400) {
        const location: string | null = response.headers.get("location");
        if (!location) return { ok: false, html: "", finalUrl: requestUrl.toString() };
        const next: URL = new URL(location, requestUrl);
        if (next.protocol !== "http:" && next.protocol !== "https:") return { ok: false, html: "", finalUrl: requestUrl.toString() };
        if (isBlockedHostname(next.hostname)) return { ok: false, html: "", finalUrl: requestUrl.toString() };
        current = next;
        continue;
      }

      if (!response.ok) return { ok: false, html: "", finalUrl: requestUrl.toString() };
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml+xml")) {
        return { ok: false, html: "", finalUrl: requestUrl.toString() };
      }
      const reader = response.body?.getReader();
      if (!reader) {
        const html = await response.text();
        return { ok: true, html: html.slice(0, maxBytes), finalUrl: requestUrl.toString() };
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          total += value.length;
          if (total > maxBytes) break;
        }
      }
      const html = new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
      return { ok: true, html, finalUrl: requestUrl.toString() };
    } catch {
      return { ok: false, html: "", finalUrl: current?.toString() || null };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { ok: false, html: "", finalUrl: current?.toString() || null };
}
