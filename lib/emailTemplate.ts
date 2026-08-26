import type { OutreachRecipient } from "@/lib/types";

export function buildPitchSubject(recipient: OutreachRecipient) {
  return `Amélioration possible de votre site ${recipient.name || "web"}`;
}

export function buildPitchHtml(recipient: OutreachRecipient, customMessage?: string) {
  const perf = recipient.performance ?? 0;
  const seo = recipient.seo ?? 0;
  const accessibility = recipient.accessibility ?? 0;
  const reply = process.env.EMAIL_REPLY_TO || "rafynhabussiness@gmail.com";

  return `
  <div style="margin:0;padding:0;background:#FAFAF8;font-family:Arial,Helvetica,sans-serif;color:#161616;">
    <div style="max-width:680px;margin:0 auto;padding:34px 18px;">
      <div style="background:#FFFFFF;border:1px solid #E7E7E2;overflow:hidden;">
        <div style="padding:34px;background:#155EEF;color:#fff;">
          <p style="margin:0 0 8px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.78;">Audit rapide de site web</p>
          <h1 style="margin:0;font-size:28px;line-height:1.15;">Bonjour ${escapeHtml(recipient.name || "")}</h1>
        </div>
        <div style="padding:32px;">
          <p style="font-size:16px;line-height:1.7;margin:0 0 18px;color:#667085;">
            Je suis tombé sur votre site et j’ai remarqué plusieurs opportunités d’amélioration qui pourraient le rendre plus moderne, plus rapide sur mobile et plus efficace pour générer des demandes.
          </p>
          ${recipient.website ? `<p style="margin:0 0 22px;color:#667085;"><strong>Site analysé :</strong> ${escapeHtml(recipient.website)}</p>` : ""}
          <div style="display:block;background:#FAFAF8;border:1px solid #E7E7E2;padding:18px;margin:20px 0;">
            <p style="margin:0 0 10px;font-weight:700;color:#161616;">Points détectés</p>
            <p style="margin:0 0 6px;color:#667085;">Performance mobile : <strong>${perf}/100</strong></p>
            <p style="margin:0 0 6px;color:#667085;">SEO : <strong>${seo}/100</strong></p>
            <p style="margin:0;color:#667085;">Accessibilité : <strong>${accessibility}/100</strong></p>
          </div>
          <p style="font-size:16px;line-height:1.7;margin:0 0 18px;color:#667085;">
            ${escapeHtml(customMessage || "Je peux vous préparer gratuitement 2 ou 3 idées concrètes pour améliorer la présentation, la vitesse et la conversion de votre site.")}
          </p>
          <a href="mailto:${escapeHtml(reply)}" style="display:inline-block;background:#155EEF;color:#fff;text-decoration:none;padding:14px 22px;border-radius:5px;font-weight:700;margin:10px 0 22px;">Répondre à Rafael</a>
          <p style="font-size:14px;line-height:1.6;color:#667085;margin:20px 0 0;">Bien cordialement,<br/>Rafael</p>
          <p style="font-size:12px;line-height:1.5;color:#667085;margin-top:24px;border-top:1px solid #E7E7E2;padding-top:16px;">
            Message envoyé suite à une analyse publique de votre site. Si vous ne souhaitez plus être contacté, répondez simplement “STOP”.
          </p>
        </div>
      </div>
    </div>
  </div>`;
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

