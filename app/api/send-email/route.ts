import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailHtml(data: {
  businessName: string;
  website: string;
  performance: number;
  seo: number;
  accessibility: number;
}) {
  const name = escapeHtml(data.businessName || "Bonjour");
  const website = escapeHtml(data.website);

  return `
  <div style="font-family:Arial,sans-serif;background:#FAFAF8;padding:32px;color:#161616">
    <div style="max-width:640px;margin:auto;background:#ffffff;border-radius:24px;padding:34px;border:1px solid #E7E7E2;box-shadow:0 20px 70px rgba(231,231,226,1)">
      <p style="margin:0 0 14px;color:#667085;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">Analyse rapide de votre site</p>
      <h1 style="margin:0 0 18px;font-size:28px;line-height:1.15;color:#161616">Bonjour ${name},</h1>
      <p style="font-size:16px;line-height:1.65;color:#667085">Je me permets de vous contacter car j’ai analysé rapidement votre site web et j’ai remarqué plusieurs points qui pourraient être améliorés, surtout sur mobile.</p>
      <div style="background:#FAFAF8;border-radius:18px;padding:20px;margin:24px 0;border:1px solid #E7E7E2">
        <p style="margin:0 0 12px"><strong>Site analysé :</strong> ${website}</p>
        <p style="margin:0 0 8px">Performance mobile : <strong>${data.performance}/100</strong></p>
        <p style="margin:0 0 8px">SEO : <strong>${data.seo}/100</strong></p>
        <p style="margin:0">Accessibilité : <strong>${data.accessibility}/100</strong></p>
      </div>
      <p style="font-size:16px;line-height:1.65;color:#667085">Je peux vous aider à moderniser le design, améliorer la vitesse mobile, rendre le site plus professionnel et augmenter les demandes de contact ou réservations.</p>
      <p style="font-size:16px;line-height:1.65;color:#667085">Si vous le souhaitez, je peux vous envoyer gratuitement 2 ou 3 idées concrètes d’amélioration pour votre site.</p>
      <a href="mailto:${escapeHtml(process.env.EMAIL_REPLY_TO || "rafynhabussiness@gmail.com")}" style="display:inline-block;margin-top:16px;background:#161616;color:#FAFAF8;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:bold">Répondre à Rafael</a>
      <p style="margin-top:28px;font-size:14px;color:#667085">Bien cordialement,<br/><strong>Rafael</strong></p>
    </div>
  </div>`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const to = String(body.to || "").trim();
    const businessName = String(body.businessName || "votre entreprise").trim();
    const website = String(body.website || "").trim();

    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.includes("your_resend")) {
      return NextResponse.json({ error: "Falta RESEND_API_KEY real no .env." }, { status: 500 });
    }

    if (!to || !to.includes("@")) {
      return NextResponse.json({ error: "Email inválido do cliente." }, { status: 400 });
    }

    console.log("[SEND-EMAIL] Sending", { to, businessName, website });

    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Rafael <onboarding@resend.dev>",
      to,
      replyTo: process.env.EMAIL_REPLY_TO || "rafynhabussiness@gmail.com",
      subject: `Amélioration possible de votre site ${businessName}`,
      html: buildEmailHtml({
        businessName,
        website,
        performance: Number(body.performance || 0),
        seo: Number(body.seo || 0),
        accessibility: Number(body.accessibility || 0)
      })
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return NextResponse.json({ success: true, id: result.data?.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao enviar email.";
    console.error("[SEND-EMAIL] ERROR", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


