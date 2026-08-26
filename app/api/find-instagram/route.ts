import { NextResponse } from "next/server";
import { findInstagramForLead } from "@/lib/leads/findInstagram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const instagram = await findInstagramForLead({
      website: body.website,
      name: body.name,
      address: body.address,
    });
    return NextResponse.json({ instagram });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao procurar Instagram." }, { status: 500 });
  }
}
