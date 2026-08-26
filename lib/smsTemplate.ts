import type { Lead } from "@/lib/types";

export function buildSmsMessage(lead: Pick<Lead, "name" | "address" | "website">) {
  const hasWebsite = Boolean(lead.website);

  if (hasWebsite) {
    return "Bonjour, j’ai analysé votre site web et j’ai remarqué quelques points à améliorer.";
  }

  return "Bonjour, j’ai vu que vous n’avez pas encore de site web et je pense que cela pourrait vous apporter plus de clients.";
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
