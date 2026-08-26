import { NextResponse } from "next/server";
import { Resend } from "resend";
import type { OutreachRecipient } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RECIPIENTS = 20;
const DEFAULT_FROM = "Rafael <contact@rafynhadev.online>";
const DEFAULT_REPLY_TO = "rafynhabussiness@gmail.com";

const resend = new Resend(process.env.RESEND_API_KEY);

function normalizeEmail(email: unknown) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanText(value: unknown, max = 800) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function buildSubject(recipient: OutreachRecipient) {
  const name = cleanText(recipient.name || "votre site", 80);
  return `Idée rapide pour améliorer ${name}`;
}

function buildEmailHtml(recipient: OutreachRecipient, customMessage: string) {
  const name = escapeHtml(cleanText(recipient.name || "", 80));
  const website = escapeHtml(cleanText(recipient.website || "", 200));

  const message = escapeHtml(
    cleanText(
      customMessage ||
        "Je crée des sites web professionnels pour les entreprises locales. Je peux vous envoyer gratuitement quelques recommandations concrètes pour rendre votre site plus moderne, plus clair et plus efficace pour recevoir des demandes de clients.",
      900
    )
  );

  return `
  <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#161616;background:#ffffff;padding:28px;line-height:1.6">
    <p>Bonjour${name ? ` ${name}` : ""},</p>

    <p>
      J’ai regardé votre site${website ? ` <a href="${website}" style="color:#155EEF">${website}</a>` : ""} et j’ai remarqué quelques améliorations possibles pour le rendre plus professionnel et plus efficace.
    </p>

    <p>${message}</p>

    <p>
      Si cela vous intéresse, répondez simplement à cet email et je vous envoie quelques idées adaptées à votre activité.
    </p>

    <p>
      Bien cordialement,<br/>
      <strong>Rafael Carvalho</strong><br/>
      Mynify Digital<br/>
      <a href="mailto:contact@rafynhadev.online" style="color:#155EEF">contact@rafynhadev.online</a>
    </p>

    <p style="font-size:12px;color:#667085;margin-top:28px">
      Si vous ne souhaitez pas être recontacté, répondez simplement “STOP”.
    </p>
  </div>
  `;
}

function buildEmailText(recipient: OutreachRecipient, customMessage: string) {
  const name = cleanText(recipient.name || "", 80);
  const website = cleanText(recipient.website || "", 200);

  const message = cleanText(
    customMessage ||
      "Je crée des sites web professionnels pour les entreprises locales. Je peux vous envoyer gratuitement quelques recommandations concrètes pour rendre votre site plus moderne, plus clair et plus efficace pour recevoir des demandes de clients.",
    900
  );

  return `Bonjour${name ? ` ${name}` : ""},

J’ai regardé votre site${website ? ` ${website}` : ""} et j’ai remarqué quelques améliorations possibles pour le rendre plus professionnel et plus efficace.

${message}

Si cela vous intéresse, répondez simplement à cet email et je vous envoie quelques idées adaptées à votre activité.

Bien cordialement,
Rafael Carvalho
Mynify Digital
contact@rafynhadev.online

Si vous ne souhaitez pas être recontacté, répondez simplement “STOP”.`;
}

export async function POST(request: Request) {
  try {
    if (
      !process.env.RESEND_API_KEY ||
      process.env.RESEND_API_KEY.includes("your_resend")
    ) {
      return NextResponse.json(
        { error: "Falta RESEND_API_KEY real no .env." },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const recipients = Array.isArray(body.recipients) ? body.recipients : [];
    const customMessage = cleanText(body.message || "", 900);

    const unique = new Map<string, OutreachRecipient>();

    for (const raw of recipients) {
      const email = normalizeEmail(raw?.email);

      if (!isValidEmail(email)) continue;

      if (!unique.has(email)) {
        unique.set(email, {
          ...raw,
          email,
        });
      }
    }

    const targets = Array.from(unique.values()).slice(0, MAX_RECIPIENTS);

    if (targets.length === 0) {
      return NextResponse.json(
        { error: "Nenhum email válido selecionado." },
        { status: 400 }
      );
    }

    const from = process.env.EMAIL_FROM || DEFAULT_FROM;
    const replyTo = process.env.EMAIL_REPLY_TO || DEFAULT_REPLY_TO;

    console.log("[SEND-BULK] started", {
      total: targets.length,
      from,
      replyTo,
    });

    const results: Array<{
      email: string;
      ok: boolean;
      id?: string | null;
      error?: string;
    }> = [];

    for (const recipient of targets) {
      try {
        const sent = await resend.emails.send({
          from,
          to: recipient.email,
          replyTo,
          subject: buildSubject(recipient),
          html: buildEmailHtml(recipient, customMessage),
          text: buildEmailText(recipient, customMessage),
        });

        results.push({
          email: recipient.email,
          ok: true,
          id: sent.data?.id || null,
        });

        console.log("[SEND-BULK] sent", {
          email: recipient.email,
          id: sent.data?.id,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        results.push({
          email: recipient.email,
          ok: false,
          error: message,
        });

        console.error("[SEND-BULK] failed", {
          email: recipient.email,
          error: message,
        });
      }
    }

    const sentCount = results.filter((r) => r.ok).length;
    const failedCount = results.filter((r) => !r.ok).length;

    return NextResponse.json({
      success: true,
      total: targets.length,
      sent: sentCount,
      failed: failedCount,
      results,
    });
  } catch (error) {
    console.error("[SEND-BULK] ERROR", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao enviar emails",
      },
      { status: 500 }
    );
  }
}

