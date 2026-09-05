import type { Lead } from "@/lib/types";

export type SmsMessageVariant = {
  id: string;
  label: string;
  objective: string;
  text: string;
};

function businessName(lead: Pick<Lead, "name">) {
  return lead.name.trim() || "votre entreprise";
}

export function buildSmsMessageVariants(lead: Pick<Lead, "name" | "address" | "website">): SmsMessageVariant[] {
  const name = businessName(lead);

  if (lead.website) {
    return [
      { id: "website-curiosity", label: "Curiosité", objective: "Obtenir une réponse sans vendre directement", text: `Bonjour, je suis tombé sur le site de ${name}. J’ai une idée simple pour le rendre plus clair sur mobile et faciliter les demandes. Je peux vous l’envoyer ici, sans engagement ?` },
      { id: "website-audit", label: "Amélioration", objective: "Ouvrir la conversation autour du site", text: `Bonjour, petite question concernant ${name} : est-ce que vous cherchez encore à améliorer les demandes de contact depuis votre site ? J’ai 2 idées concrètes à vous montrer.` },
      { id: "website-local", label: "Local", objective: "Parler de visibilité locale", text: `Bonjour, je travaille sur la visibilité de commerces locaux comme ${name}. J’ai remarqué une piste pour mieux transformer les visites Google en appels. Je vous l’envoie ?` },
      { id: "website-short", label: "Très courte", objective: "Tester un premier contact minimal", text: `Bonjour, j’ai une suggestion rapide pour améliorer le site de ${name} sur mobile. Je peux vous l’envoyer ?` },
    ];
  }

  return [
    { id: "no-website-opportunity", label: "Opportunité", objective: "Présenter la valeur d’un site", text: `Bonjour, je cherchais ${name} et j’ai vu votre fiche Google. Avez-vous déjà pensé à un site simple pour recevoir plus de demandes et présenter vos services ?` },
    { id: "no-website-question", label: "Question", objective: "Commencer par une question naturelle", text: `Bonjour, je me permets une question : comment les nouveaux clients trouvent-ils ${name} aujourd’hui ? Je peux vous montrer une idée simple pour compléter Google.` },
    { id: "no-website-local", label: "Local", objective: "Mettre l’accent sur les recherches locales", text: `Bonjour, j’ai trouvé ${name} sur Google et je travaille avec des entreprises locales pour mieux convertir les recherches en appels. Voulez-vous voir un exemple rapide ?` },
    { id: "no-website-short", label: "Très courte", objective: "Tester un premier contact minimal", text: `Bonjour, j’ai une idée simple pour aider ${name} à recevoir plus de demandes en ligne. Je peux vous l’expliquer en 2 minutes ?` },
  ];
}

export function buildSmsMessage(lead: Pick<Lead, "name" | "address" | "website">) {
  return buildSmsMessageVariants(lead)[0]?.text || "Bonjour, puis-je vous envoyer une idée rapide pour votre activité ?";
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
