import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CRM storage principal fica no browser/localStorage para não obrigar base de dados.
// Esta rota existe para manter uma interface API estável e futura migração para DB.
export async function GET() {
  return NextResponse.json({ leads: [], storage: "client-localStorage" });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({ ok: true, received: Array.isArray(body.leads) ? body.leads.length : 0 });
}
