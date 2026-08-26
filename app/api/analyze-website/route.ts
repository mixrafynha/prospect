import { NextResponse } from "next/server";
import { analyzeWebsite } from "@/lib/leads/analyzeWebsite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const website = String(body.website || "").trim();
    if (!website) return NextResponse.json({ error: "Website obrigatório." }, { status: 400 });
    const analysis = await analyzeWebsite(website, body.metrics || undefined);
    return NextResponse.json({ website, analysis });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao analisar website." }, { status: 500 });
  }
}
