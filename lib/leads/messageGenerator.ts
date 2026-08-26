import type { CrmLead } from "./types";

const nicheOpeners: Record<string, string[]> = {
  cabeleireiro: ["vi o vosso salão", "encontrei o vosso salão no Google", "passei pelo vosso perfil/site"],
  restaurante: ["vi o vosso restaurante", "encontrei o vosso restaurante no Google", "estive a ver a vossa presença online"],
  construção: ["vi a vossa empresa de construção", "encontrei a vossa empresa no Google", "estive a ver o vosso site"],
  estética: ["vi o vosso instituto de estética", "encontrei o vosso espaço no Google", "estive a ver o vosso site e Instagram"],
  tatuagem: ["vi o vosso estúdio de tatuagem", "encontrei o vosso estúdio no Google", "estive a ver a vossa presença online"],
  barbearia: ["vi a vossa barbearia", "encontrei a vossa barbearia no Google", "estive a ver o vosso perfil/site"],
  imobiliária: ["vi a vossa agência", "encontrei a vossa imobiliária no Google", "estive a ver o vosso site"],
  genérico: ["encontrei a vossa empresa", "estive a ver o vosso site", "vi a vossa presença online"],
};

function detectNiche(lead: CrmLead) {
  const text = `${lead.niche || ""} ${lead.name} ${lead.website} ${lead.tags?.join(" ") || ""}`.toLowerCase();
  if (/coiff|hair|cabelo|salon/.test(text)) return "cabeleireiro";
  if (/restaurante|restaurant|pizza|sushi|burger|café|cafe/.test(text)) return "restaurante";
  if (/constr|batiment|bâtiment|renov|peinture|carrelage/.test(text)) return "construção";
  if (/estet|esthé|beaut|beauty|ongle|nail|spa|laser/.test(text)) return "estética";
  if (/tattoo|tatu/.test(text)) return "tatuagem";
  if (/barber|barbear/.test(text)) return "barbearia";
  if (/immo|immobilier|real estate|agence/.test(text)) return "imobiliária";
  return "genérico";
}

function pick(items: string[], seed: string) {
  const value = [...seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return items[value % items.length];
}

function bestIssue(lead: CrmLead) {
  const all = [...(lead.issues || []), ...(lead.reasons || [])];
  const issue = all.find((item) => /contact|cta|botão|bouton/i.test(item))
    || all.find((item) => /mobile|performance|carregar|lento|vitesse/i.test(item))
    || all.find((item) => /instagram/i.test(item))
    || all.find((item) => /seo|description|title/i.test(item))
    || all[0];

  if (!issue) return "a apresentação online podia ficar mais clara para gerar pedidos";
  if (/contact|cta|botão|bouton/i.test(issue)) return "o botão de contacto/reserva podia ficar mais visível";
  if (/mobile/i.test(issue)) return "a versão mobile podia ficar mais simples e direta";
  if (/performance|carregar|lento|vitesse/i.test(issue)) return "o site parece demorar um pouco a carregar";
  if (/instagram/i.test(issue)) return "o Instagram não está muito visível no site";
  if (/seo|description|title/i.test(issue)) return "o texto que aparece no Google podia ser melhorado";
  return issue.charAt(0).toLowerCase() + issue.slice(1);
}

export function generateLeadMessage(lead: CrmLead) {
  const niche = detectNiche(lead);
  const opener = pick(nicheOpeners[niche] || nicheOpeners.genérico, `${lead.id}-${Date.now()}`);
  const issue = bestIssue(lead);
  const instagramLine = lead.instagram?.username
    ? "Também vi que usam Instagram, por isso a ideia seria ligar melhor o site ao contacto pelo Instagram."
    : "Também podia ser útil deixar o Instagram/contacto mais fácil de encontrar.";

  const closers = [
    "Posso mostrar 2 ou 3 ideias rápidas sem compromisso.",
    "Se quiserem, envio uma sugestão simples de melhoria.",
    "Se fizer sentido, posso mostrar uma versão mais moderna e direta.",
  ];

  return `Bonjour,\n\n${opener} e reparei que ${issue}. ${instagramLine}\n\n${pick(closers, `${lead.name}-${lead.weakScore}-${lead.updatedAt}`)}\n\nBonne journée,\nRafael`;
}
