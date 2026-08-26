type Base = {
  website?: string;
  performance?: number;
  seo?: number;
  accessibility?: number;
  bestPractices?: number;
  auditAvailable?: boolean;
};

export function buildWeakScore(site: Base) {
  let weakScore = 0;
  const reasons: string[] = [];

  if (!site.website) {
    weakScore += 70;
    reasons.push("Sem website");
    return { weakScore, reasons };
  }

  // Nunca tratamos uma auditoria que falhou como um score real de 0.
  if (site.auditAvailable === false) {
    reasons.push("Auditoria técnica indisponível");
    return { weakScore: 0, reasons };
  }

  if ((site.performance ?? 100) < 50) {
    weakScore += 35;
    reasons.push("Performance mobile baixa");
  } else if ((site.performance ?? 100) < 70) {
    weakScore += 18;
    reasons.push("Performance mobile melhorável");
  }

  if ((site.seo ?? 100) < 70) {
    weakScore += 25;
    reasons.push("SEO fraco");
  } else if ((site.seo ?? 100) < 85) {
    weakScore += 10;
    reasons.push("SEO melhorável");
  }

  if ((site.accessibility ?? 100) < 70) {
    weakScore += 15;
    reasons.push("Acessibilidade fraca");
  }

  if ((site.bestPractices ?? 100) < 70) {
    weakScore += 15;
    reasons.push("Boas práticas baixas");
  }

  return { weakScore: Math.min(100, weakScore), reasons };
}
