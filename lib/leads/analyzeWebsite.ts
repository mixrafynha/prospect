import type { WebsiteAnalysis } from "./types";
import { buildWeakScore } from "./scoring";
import { extractInstagramFromHtml } from "./findInstagram";

function normalizeWebsite(url: string) {
  const clean = String(url || "").trim();
  if (!clean) return "";
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function fetchHtml(url: string, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 WeakSiteFinderBot/1.0" },
      cache: "no-store",
    });
    const html = response.ok ? await response.text() : "";
    return { html, ms: Date.now() - started, ok: response.ok };
  } catch {
    return { html: "", ms: timeoutMs, ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

function findContactPage(html: string, website: string) {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const contact = hrefs.find((href) => /contact|devis|reservation|rendez-vous|rdv|quote|appointment/i.test(href));
  if (!contact) return null;
  try { return new URL(contact, website).toString(); } catch { return contact; }
}

export async function analyzeWebsite(websiteInput: string, metrics?: Partial<{ performance: number; seo: number; accessibility: number; bestPractices: number }>): Promise<WebsiteAnalysis> {
  const website = normalizeWebsite(websiteInput);
  const issues: string[] = [];
  const opportunities: string[] = [];

  if (!website) {
    return {
      speed: 0, design: 0, mobile: 0, seo: 0, weakScore: 100,
      issues: ["Sem website"], opportunities: ["Criar uma presença online simples e clara"],
      contactPage: null, hasHttps: false, hasTitle: false, hasDescription: false, hasInstagram: false, hasContactCta: false,
      analyzedAt: new Date().toISOString(),
    };
  }

  const { html, ms, ok } = await fetchHtml(website);
  const lower = html.toLowerCase();
  const hasHttps = website.startsWith("https://");
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  const hasTitle = title.length > 8;
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() || "";
  const hasDescription = description.length > 35;
  const hasInstagram = Boolean(extractInstagramFromHtml(html).url);
  const hasContactCta = /contact|devis|réserver|reserver|reservation|rendez-vous|rdv|appel|call|phone|téléphone|telephone|whatsapp/i.test(html);
  const contactPage = findContactPage(html, website);
  const imageCount = (html.match(/<img\b/gi) || []).length;
  const scriptCount = (html.match(/<script\b/gi) || []).length;
  const oldSignals = /wordpress|wp-content|jquery|table layout|flash|font-size:\s?12px|copyright\s?20(0\d|1\d)/i.test(html);

  if (!ok) issues.push("Site difícil de carregar ou bloqueado");
  if (!hasHttps) issues.push("Sem HTTPS");
  if (!hasTitle) issues.push("Meta title fraco ou ausente");
  if (!hasDescription) issues.push("Meta description ausente ou curta");
  if (!hasContactCta) issues.push("Botão de contacto/CTA pouco visível");
  if (!contactPage) issues.push("Página de contacto difícil de encontrar");
  if (!hasInstagram) issues.push("Instagram não está visível no site");
  if (ms > 2500) issues.push("Site demora a carregar");
  if (imageCount > 18) issues.push("Muitas imagens podem estar a pesar o site");
  if (oldSignals) issues.push("Design parece antigo ou pouco moderno");

  if (!hasContactCta) opportunities.push("Adicionar um botão claro para contacto, reserva ou orçamento");
  if (!hasInstagram) opportunities.push("Mostrar o Instagram no topo e no rodapé do site");
  if (!hasDescription) opportunities.push("Melhorar o texto SEO que aparece no Google");
  if (ms > 1800) opportunities.push("Otimizar imagens e carregamento mobile");
  if (oldSignals) opportunities.push("Modernizar o visual para aumentar confiança");
  if (!contactPage) opportunities.push("Criar ou destacar uma página de contacto simples");

  const speed = clampScore(metrics?.performance ?? (ms < 900 ? 86 : ms < 1800 ? 68 : ms < 3000 ? 45 : 25));
  const seo = clampScore(metrics?.seo ?? (100 - (!hasTitle ? 25 : 0) - (!hasDescription ? 25 : 0) - (!hasHttps ? 10 : 0)));
  const mobile = clampScore(100 - (scriptCount > 20 ? 16 : 0) - (imageCount > 16 ? 14 : 0) - (ms > 2500 ? 22 : 0) - (!hasContactCta ? 12 : 0));
  const design = clampScore(88 - (oldSignals ? 25 : 0) - (!hasContactCta ? 14 : 0) - (!hasInstagram ? 8 : 0) - (imageCount === 0 ? 10 : 0));

  const score = buildWeakScore({
    website, performance: speed, seo, accessibility: metrics?.accessibility ?? 70,
    bestPractices: metrics?.bestPractices ?? 70, design, mobile, hasInstagram, hasContactCta, hasHttps, hasDescription,
  });

  return {
    speed, design, mobile, seo,
    weakScore: score.weakScore,
    issues: Array.from(new Set(issues)),
    opportunities: Array.from(new Set(opportunities)),
    contactPage,
    hasHttps,
    hasTitle,
    hasDescription,
    hasInstagram,
    hasContactCta,
    analyzedAt: new Date().toISOString(),
  };
}
