type Base = {
  website?: string;
  performance?: number;
  seo?: number;
  accessibility?: number;
  bestPractices?: number;
  design?: number;
  mobile?: number;
  hasInstagram?: boolean;
  hasContactCta?: boolean;
  hasHttps?: boolean;
  hasDescription?: boolean;
};

export function buildWeakScore(site: Base) {
  let weakScore = 0;
  const reasons: string[] = [];

  if (!site.website) {
    weakScore += 50;
    reasons.push("Sem website");
  }
  if (site.website && site.hasHttps === false) {
    weakScore += 10;
    reasons.push("Sem HTTPS");
  }
  if ((site.performance ?? 0) < 50) {
    weakScore += 25;
    reasons.push("Performance mobile baixa");
  }
  if ((site.seo ?? 0) < 70) {
    weakScore += 18;
    reasons.push("SEO fraco");
  }
  if ((site.accessibility ?? 0) < 70) {
    weakScore += 8;
    reasons.push("Acessibilidade fraca");
  }
  if ((site.bestPractices ?? 0) < 70) {
    weakScore += 8;
    reasons.push("Boas práticas baixas");
  }
  if ((site.mobile ?? 100) < 65) {
    weakScore += 14;
    reasons.push("Mobile pode melhorar");
  }
  if ((site.design ?? 100) < 65) {
    weakScore += 12;
    reasons.push("Design pouco moderno");
  }
  if (site.hasContactCta === false) {
    weakScore += 10;
    reasons.push("CTA/contacto pouco visível");
  }
  if (site.hasInstagram === false) {
    weakScore += 8;
    reasons.push("Instagram pouco visível no site");
  }
  if (site.hasDescription === false) {
    weakScore += 8;
    reasons.push("Sem meta description");
  }

  return { weakScore: Math.min(100, weakScore), reasons: Array.from(new Set(reasons)) };
}
