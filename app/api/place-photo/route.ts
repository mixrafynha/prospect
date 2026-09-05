import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name") || "";
  if (!GOOGLE_API_KEY || !name.startsWith("places/")) {
    return new Response("Not found", { status: 404 });
  }

  const response = await fetch(
    `https://places.googleapis.com/v1/${name}/media?maxWidthPx=720&key=${encodeURIComponent(GOOGLE_API_KEY)}`,
    { next: { revalidate: 86400 } },
  );
  if (!response.ok) return new Response("Photo unavailable", { status: response.status });

  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
