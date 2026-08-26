import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET() {
  try {
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM!,
      to: "rafynhabussiness@gmail.com",
      subject: "Teste Resend",
      html: `
        <h1>Teste OK 🚀</h1>
        <p>O domínio rafynhadev.online está configurado corretamente.</p>
      `,
      replyTo: process.env.EMAIL_REPLY_TO,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error,
      },
      { status: 500 }
    );
  }
}