import type { Lead } from "@/lib/types";

export function buildSmsMessage(lead: Pick<Lead, "name" | "address" | "website">) {
  const hasWebsite = Boolean(lead.website);

  if (hasWebsite) {
    return [
      `Bonjour ${lead.name},`,
      "J’ai aimé votre présence en ligne — on sent une vraie activité derrière votre business.",
      `J’ai vu votre site ici : ${lead.website}`,
      "Je peux vous montrer rapidement 2 ou 3 idées simples pour le rendre encore plus clair et plus efficace.",
    ].join("\n\n");
  }

  return [
    `Bonjour ${lead.name},`,
    "J’ai vu que vous n’avez pas encore de site. J’ai une petite idée qui pourrait vous apporter plus de clients.",
    "Je peux vous la montrer gratuitement ?",
  ].join("\n\n");
}

export function buildSmsLink(
  phoneE164: string,
  message: string,
  options?: { includeBody?: boolean },
) {
  const includeBody = options?.includeBody !== false;
  if (!message || !includeBody) {
    return `sms:${phoneE164}`;
  }

  const encoded = encodeURIComponent(message);
  return `sms:${phoneE164}?body=${encoded}`;
}

export function buildSmsHref(phoneE164: string, message: string) {
  return buildSmsLink(phoneE164, message);
}
