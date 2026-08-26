export type AuditIssue = {
  id: string;
  title: string;
  severity: "high" | "medium" | "low";
  category: "conversion" | "design" | "seo" | "performance" | "trust" | "mobile" | "technical";
  evidence: string;
  fix: string;
  pitch: string;
};

export type SiteAuditReport = {
  finalUrl: string;
  checkedUrls: string[];
  title: string | null;
  description: string | null;
  h1: string | null;
  hasPhone: boolean;
  hasEmail: boolean;
  hasContactPage: boolean;
  hasBooking: boolean;
  hasHttps: boolean;
  imageCount: number;
  imagesWithoutAlt: number;
  wordCount: number;
  loadMs: number;
  htmlBytes: number;
  issues: AuditIssue[];
  opportunities: string[];
  clientTalkTrack: string[];
};

type PageResult = {
  url: string;
  html: string;
  finalUrl: string;
  loadMs: number;
};

const CONTACT_PATHS = ["/", "/contact", "/contactez-nous", "/contacts", "/reservation", "/rendez-vous", "/mentions-legales"];
const PHONE_REGEX = /(?:\+33|0)\s?[1-9](?:[\s.\-]?\d{2}){4}/;
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function normalizeUrl(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textBetween(html: string, regex: RegExp) {
  const match = html.match(regex);
  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function hasAny(html: string, words: string[]) {
  const lower = html.toLowerCase();
  return words.some((word) => lower.includes(word));
}

async function fetchHtml(url: URL): Promise<PageResult | null> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 WeakSiteFinder AuditBot/2.0",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8"
      }
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || (!contentType.includes("text/html") && !contentType.includes("text/plain"))) return null;
    const html = await response.text();
    return { url: url.toString(), finalUrl: response.url || url.toString(), html, loadMs: Date.now() - startedAt };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function addIssue(issues: AuditIssue[], issue: AuditIssue) {
  if (!issues.some((item) => item.id === issue.id)) issues.push(issue);
}

export async function analyzeWebsite(website: string): Promise<SiteAuditReport> {
  const baseUrl = normalizeUrl(website);
  if (!baseUrl) {
    return {
      finalUrl: website,
      checkedUrls: [],
      title: null,
      description: null,
      h1: null,
      hasPhone: false,
      hasEmail: false,
      hasContactPage: false,
      hasBooking: false,
      hasHttps: false,
      imageCount: 0,
      imagesWithoutAlt: 0,
      wordCount: 0,
      loadMs: 0,
      htmlBytes: 0,
      issues: [{
        id: "website-unreachable",
        title: "Site impossível de analisar",
        severity: "high",
        category: "technical",
        evidence: "O URL recebido não é válido.",
        fix: "Confirmar o domínio e configurar redirecionamento HTTPS correto.",
        pitch: "O site pode estar a perder clientes porque nem sempre abre corretamente."
      }],
      opportunities: ["Corrigir o acesso ao site antes de qualquer melhoria visual."],
      clientTalkTrack: ["Tentei abrir o vosso site e encontrei um problema técnico de acesso."]
    };
  }

  const checkedUrls: string[] = [];
  const pages: PageResult[] = [];

  for (const path of CONTACT_PATHS) {
    const url = new URL(path, baseUrl.origin);
    checkedUrls.push(url.toString());
    const page = await fetchHtml(url);
    if (page && page.html.length > 80) pages.push(page);
    if (pages.length >= 3) break;
  }

  const home = pages[0];
  const combinedHtml = pages.map((page) => page.html).join("\n");
  const cleanText = stripHtml(combinedHtml);
  const homeHtml = home?.html || "";
  const title = textBetween(homeHtml, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = textBetween(homeHtml, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    || textBetween(homeHtml, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i);
  const h1 = textBetween(homeHtml, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const imageTags = combinedHtml.match(/<img\b[^>]*>/gi) || [];
  const imagesWithoutAlt = imageTags.filter((tag) => !/\salt=["'][^"']{2,}["']/i.test(tag)).length;
  const wordCount = cleanText ? cleanText.split(/\s+/).filter(Boolean).length : 0;
  const hasPhone = PHONE_REGEX.test(cleanText);
  const hasEmail = EMAIL_REGEX.test(combinedHtml);
  const hasContactPage = pages.some((page) => /contact|contactez|reservation|rendez-vous/i.test(page.url));
  const hasBooking = hasAny(combinedHtml, ["planity", "calendly", "reservation", "réservation", "rendez-vous", "booking", "prendre rendez-vous"]);
  const hasHttps = (home?.finalUrl || baseUrl.toString()).startsWith("https://");
  const loadMs = home?.loadMs || 0;
  const htmlBytes = homeHtml.length;

  const issues: AuditIssue[] = [];

  if (!home) {
    addIssue(issues, {
      id: "website-unreachable",
      title: "Site difícil ou impossível de abrir",
      severity: "high",
      category: "technical",
      evidence: "A app tentou abrir o website mas não conseguiu obter HTML público.",
      fix: "Verificar alojamento, domínio, redirecionamentos e certificado SSL.",
      pitch: "Se um cliente não consegue abrir o site rapidamente, ele vai direto para outro negócio."
    });
  }
  if (!title || title.length < 10) addIssue(issues, {
    id: "weak-title",
    title: "Título SEO fraco ou vazio",
    severity: "medium",
    category: "seo",
    evidence: title ? `Título atual: ${title}` : "Não foi encontrado um título claro na página principal.",
    fix: "Criar um título com serviço + cidade + nome da empresa.",
    pitch: "Dá para melhorar a forma como o site aparece no Google."
  });
  if (!description || description.length < 70) addIssue(issues, {
    id: "weak-description",
    title: "Meta descrição pouco convincente",
    severity: "medium",
    category: "seo",
    evidence: description ? `Descrição atual curta: ${description}` : "Não foi encontrada meta description relevante.",
    fix: "Adicionar uma descrição curta com serviços, zona e chamada para contacto.",
    pitch: "Uma descrição melhor aumenta os cliques quando alguém encontra o site."
  });
  if (!h1 || h1.length < 8) addIssue(issues, {
    id: "missing-h1",
    title: "Página sem headline principal clara",
    severity: "medium",
    category: "design",
    evidence: h1 ? `H1 atual: ${h1}` : "Não foi encontrado H1 na homepage.",
    fix: "Adicionar uma frase principal clara: serviço, benefício e zona.",
    pitch: "A primeira frase do site devia explicar em 3 segundos o que vocês fazem."
  });
  if (!hasPhone) addIssue(issues, {
    id: "missing-phone",
    title: "Telefone pouco visível ou inexistente",
    severity: "high",
    category: "conversion",
    evidence: "Não foi detetado número francês visível nas páginas analisadas.",
    fix: "Colocar botão de chamada no topo, no hero e no rodapé.",
    pitch: "Para negócios locais, o telefone visível pode gerar pedidos imediatos."
  });
  if (!hasBooking && !hasContactPage) addIssue(issues, {
    id: "weak-contact-flow",
    title: "Contacto/reserva pouco direto",
    severity: "high",
    category: "conversion",
    evidence: "Não foi detetada página de contacto/reserva clara nas páginas analisadas.",
    fix: "Criar CTA fixo: Appeler, Devis gratuit, Réserver ou WhatsApp.",
    pitch: "O site devia transformar visitas em chamadas ou marcações sem esforço."
  });
  if (!hasHttps) addIssue(issues, {
    id: "no-https",
    title: "HTTPS não confirmado",
    severity: "high",
    category: "trust",
    evidence: `URL final: ${home?.finalUrl || baseUrl.toString()}`,
    fix: "Ativar certificado SSL e forçar redirecionamento para HTTPS.",
    pitch: "Sem HTTPS, o site passa menos confiança e pode afastar clientes."
  });
  if (loadMs > 3500) addIssue(issues, {
    id: "slow-html",
    title: "Site demora a responder",
    severity: "medium",
    category: "performance",
    evidence: `HTML inicial recebido em ${loadMs}ms.`,
    fix: "Otimizar alojamento, imagens, scripts e cache.",
    pitch: "No mobile, poucos segundos já chegam para perder uma visita."
  });
  if (htmlBytes > 650000) addIssue(issues, {
    id: "heavy-page",
    title: "Página demasiado pesada",
    severity: "medium",
    category: "performance",
    evidence: `HTML da homepage com aproximadamente ${Math.round(htmlBytes / 1024)} KB.`,
    fix: "Remover código morto, scripts pesados e imagens inline.",
    pitch: "Uma página mais leve abre melhor no telefone e passa mais profissionalismo."
  });
  if (imageTags.length > 0 && imagesWithoutAlt / imageTags.length > 0.45) addIssue(issues, {
    id: "images-no-alt",
    title: "Muitas imagens sem texto alternativo",
    severity: "low",
    category: "seo",
    evidence: `${imagesWithoutAlt}/${imageTags.length} imagens sem alt útil.`,
    fix: "Adicionar descrições às imagens importantes.",
    pitch: "Ajuda no SEO local e melhora a acessibilidade do site."
  });
  if (wordCount < 180 && home) addIssue(issues, {
    id: "thin-content",
    title: "Conteúdo demasiado curto",
    severity: "medium",
    category: "seo",
    evidence: `A app detetou cerca de ${wordCount} palavras nas páginas analisadas.`,
    fix: "Adicionar serviços, zonas atendidas, provas, FAQs e argumentos de confiança.",
    pitch: "Com mais conteúdo útil, o site fica mais credível e tem mais hipóteses no Google."
  });

  const opportunities = issues.slice(0, 5).map((issue) => issue.fix);
  const clientTalkTrack = issues.slice(0, 4).map((issue) => issue.pitch);

  return {
    finalUrl: home?.finalUrl || baseUrl.toString(),
    checkedUrls,
    title,
    description,
    h1,
    hasPhone,
    hasEmail,
    hasContactPage,
    hasBooking,
    hasHttps,
    imageCount: imageTags.length,
    imagesWithoutAlt,
    wordCount,
    loadMs,
    htmlBytes,
    issues,
    opportunities,
    clientTalkTrack
  };
}
