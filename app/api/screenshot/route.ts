import { NextResponse } from "next/server";
import { buildScreenshotUrl } from "@/lib/leads/screenshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const website = String(body.website || "").trim();
    if (!website) return NextResponse.json({ error: "Website obrigatório." }, { status: 400 });
    return NextResponse.json({ website, screenshotUrl: buildScreenshotUrl(website) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao gerar screenshot." }, { status: 500 });
  }
}
