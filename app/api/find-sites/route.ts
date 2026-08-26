import { NextResponse } from "next/server";
import { buildWeakScore } from "@/lib/scoring";
import { dedupePhones, normalizeFrenchPhone } from "@/lib/phone";
import { enrichWebsiteContacts } from "@/lib/websiteEnrichment";
import { safePublicUrl } from "@/lib/safeFetch";
import type { Lead, PhoneNumberData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  businessStatus?: string;
  primaryType?: string;
  types?: string[];
  location?: { latitude?: number; longitude?: number };
};

type SearchResponse = { places?: GooglePlace[]; nextPageToken?: string };

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
const MAX_PAGES = 3;

function logStep(step: string, data?: unknown) {
  console.log(`[FIND-SITES] ${step}`, data ?? "");
}

function normalizeDomain(website: string) {
  const url = safePublicUrl(website);
  if (!url) return null;
  return url.hostname.replace(/^www\./i, "").toLowerCase();
}

async function searchPage(query: string, pageToken?: string): Promise<SearchResponse> {
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY.includes("your_google")) {
    throw new Error("Mete a tua GOOGLE_API_KEY no ficheiro .env e reinicia o servidor.");
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.internationalPhoneNumber,places.businessStatus,places.primaryType,places.types,places.location,nextPageToken",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "fr",
      pageSize: 20,
      ...(pageToken ? { pageToken } : {}),
    }),
  });

  const data = (await response.json().catch(() => null)) as SearchResponse & { error?: { message?: string } } | null;
  logStep("Google Places response", {
    status: response.status,
    ok: response.ok,
    placesCount: data?.places?.length || 0,
    nextPageToken: Boolean(data?.nextPageToken),
  });

  if (!response.ok) {
    throw new Error(data?.error?.message || `Erro Google Places. Status ${response.status}`);
  }

  return { places: data?.places || [], nextPageToken: data?.nextPageToken };
}

async function searchBusinesses(query: string) {
  const seen = new Set<string>();
  const results: GooglePlace[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await searchPage(query, pageToken);
    for (const place of data.places || []) {
      const id = place.id || `${place.displayName?.text || ""}|${place.formattedAddress || ""}`;
      if (seen.has(id)) continue;
      seen.add(id);
      results.push(place);
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  return results;
}

async function checkPageSpeed(url: string) {
  try {
    const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    api.searchParams.set("url", url);
    api.searchParams.set("strategy", "mobile");
    api.searchParams.append("category", "performance");
    api.searchParams.append("category", "seo");
    api.searchParams.append("category", "accessibility");
    api.searchParams.append("category", "best-practices");
    api.searchParams.set("key", GOOGLE_API_KEY);

    const response = await fetch(api, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    const categories = data?.lighthouseResult?.categories;

    if (!response.ok || !categories) {
      return { performance: 0, seo: 0, accessibility: 0, bestPractices: 0, auditAvailable: false, auditError: "PageSpeed indisponível", auditDetails: [] };
    }

    return {
      performance: Math.round((categories.performance?.score ?? 0) * 100),
      seo: Math.round((categories.seo?.score ?? 0) * 100),
      accessibility: Math.round((categories.accessibility?.score ?? 0) * 100),
      bestPractices: Math.round((categories["best-practices"]?.score ?? 0) * 100),
      auditAvailable: true,
      auditError: null,
      auditDetails: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { performance: 0, seo: 0, accessibility: 0, bestPractices: 0, auditAvailable: false, auditError: message, auditDetails: [] };
  }
}

function phonesFromPlace(place: GooglePlace): PhoneNumberData[] {
  return dedupePhones(
    [place.nationalPhoneNumber, place.internationalPhoneNumber]
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeFrenchPhone(value, "google", place.googleMapsUri || null))
      .filter((value): value is PhoneNumberData => Boolean(value))
  );
}

function isMobile(phone: PhoneNumberData) {
  const national = phone.normalizedNational?.replace(/\s+/g, "") || "";
  return phone.valid && (national.startsWith("06") || national.startsWith("07"));
}

function dedupeLeads(leads: Lead[]) {
  const byPlace = new Map<string, Lead>();
  const byPhone = new Map<string, Lead>();
  const byDomain = new Map<string, Lead>();
  const byNameAddress = new Map<string, Lead>();
  const output: Lead[] = [];

  for (const lead of leads) {
    const placeKey = lead.placeId || "";
    const phoneKey = lead.phones.find((phone) => phone.normalizedE164)?.normalizedE164 || "";
    const domainKey = normalizeDomain(lead.website) || "";
    const nameAddressKey = `${lead.name.trim().toLowerCase()}|${lead.address.trim().toLowerCase()}`;
    const existing = (placeKey && byPlace.get(placeKey)) || (phoneKey && byPhone.get(phoneKey)) || (domainKey && byDomain.get(domainKey)) || byNameAddress.get(nameAddressKey);

    if (!existing) {
      output.push(lead);
      if (placeKey) byPlace.set(placeKey, lead);
      if (phoneKey) byPhone.set(phoneKey, lead);
      if (domainKey) byDomain.set(domainKey, lead);
      byNameAddress.set(nameAddressKey, lead);
      continue;
    }

    const merged: Lead = {
      ...existing,
      ...lead,
      phones: dedupePhones([...(existing.phones || []), ...(lead.phones || [])]),
      mobilePhones: dedupePhones([...(existing.mobilePhones || []), ...(lead.mobilePhones || [])]),
      hasMobilePhone: existing.hasMobilePhone || lead.hasMobilePhone,
      hasWebsiteMobilePhone: existing.hasWebsiteMobilePhone || lead.hasWebsiteMobilePhone,
      email: existing.email || lead.email,
      emailSource: existing.emailSource || lead.emailSource,
    };

    const index = output.indexOf(existing);
    if (index >= 0) output[index] = merged;
    if (placeKey) byPlace.set(placeKey, merged);
    if (phoneKey) byPhone.set(phoneKey, merged);
    if (domainKey) byDomain.set(domainKey, merged);
    byNameAddress.set(nameAddressKey, merged);
  }

  return output;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = await request.json().catch(() => ({}));
    const query = String(body.query || "").trim();
    const detectEmails = body.detectEmails !== false;

    if (query.length < 3) {
      return NextResponse.json({ error: "Escreve uma pesquisa. Ex: coiffeur Paris 13" }, { status: 400 });
    }

    const places = await searchBusinesses(query);
    const leads: Lead[] = [];

    for (const [index, place] of places.entries()) {
      const name = place.displayName?.text || "Sem nome";
      const website = place.websiteUri || "";
      logStep(`Processing ${index + 1}/${places.length}`, { name, website: website || "sem site" });

      const websiteResult = website
        ? await enrichWebsiteContacts(website)
        : { email: null, emailSource: null, phones: [], checkedEmailPages: [], checkedPhonePages: [], finalUrl: null };

      const metrics = website
        ? await checkPageSpeed(website)
        : { performance: 0, seo: 0, accessibility: 0, bestPractices: 0, auditAvailable: false, auditError: null, auditDetails: [] };

      const googlePhones = phonesFromPlace(place);
      const phones = dedupePhones([...googlePhones, ...(websiteResult.phones || [])]);
      const mobilePhones = phones.filter((phone) => isMobile(phone));

      const base = {
        placeId: place.id || null,
        name,
        address: place.formattedAddress || "",
        website,
        maps: place.googleMapsUri || "",
        businessStatus: place.businessStatus || null,
        primaryType: place.primaryType || null,
        types: place.types || [],
        location: place.location ? { latitude: place.location.latitude ?? null, longitude: place.location.longitude ?? null } : null,
        rating: typeof place.rating === "number" ? place.rating : null,
        userRatingCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
        email: detectEmails ? websiteResult.email : null,
        emailSource: detectEmails ? websiteResult.emailSource : null,
        phones,
        mobilePhones,
        hasMobilePhone: mobilePhones.length > 0,
        hasWebsiteMobilePhone: (websiteResult.phones || []).some((phone) => phone.valid && phone.isMobile),
        ...metrics,
      };

      leads.push({ ...base, ...buildWeakScore(base) });
    }

    const deduped = dedupeLeads(leads);
    deduped.sort((a, b) => Number(b.hasMobilePhone) - Number(a.hasMobilePhone) || Number(b.hasWebsiteMobilePhone) - Number(a.hasWebsiteMobilePhone) || b.weakScore - a.weakScore);

    return NextResponse.json({
      query,
      total: deduped.length,
      pagination: { maxPages: MAX_PAGES, pageSize: 20, supportedByApi: true },
      leads: deduped,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[FIND-SITES] API ERROR:", { message, stack: error instanceof Error ? error.stack : null, durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
