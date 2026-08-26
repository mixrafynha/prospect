import { NextResponse } from "next/server";
import { findEmailOnWebsite } from "@/lib/emailFinder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const website = String(body.website || "").trim();

    if (!website) {
      return NextResponse.json({ error: "Website obrigatório." }, { status: 400 });
    }

    console.log("[FIND-EMAIL] started", { website });
    const result = await findEmailOnWebsite(website);
    console.log("[FIND-EMAIL] completed", result);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[FIND-EMAIL] ERROR", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao procurar email" },
      { status: 500 }
    );
  }
}
