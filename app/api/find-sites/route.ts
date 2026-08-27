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
type AutocompleteSuggestion = {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
  };
};
type SearchRequest = {
  query?: string;
  locationText?: string;
  lat?: number | string;
  lng?: number | string;
  radius?: number | string;
  placeId?: string;
  detectEmails?: boolean;
};

type ResolvedLocation = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  source: "coordinates" | "place_id" | "text";
  label: string | null;
  placeId: string | null;
};

type LocationResolutionAttempt = {
  label: string;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
  score: number;
  placeTypes: string[];
};

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
const MAX_PAGES = 3;
const DEFAULT_RADIUS_METERS = 5000;
const ALLOWED_RADIUS_METERS = new Set([2000, 5000, 10000, 20000, 50000]);

function logStep(step: string, data?: unknown) {
  console.log(`[FIND-SITES] ${step}`, data ?? "");
}

function normalizeDomain(website: string) {
  const url = safePublicUrl(website);
  if (!url) return null;
  return url.hostname.replace(/^www\./i, "").toLowerCase();
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreLocationCandidate(input: string, candidate: GooglePlace) {
  const normalizedInput = normalizeText(input);
  const normalizedName = normalizeText(candidate.displayName?.text || "");
  const normalizedAddress = normalizeText(candidate.formattedAddress || "");
  const types = candidate.types || [];
  let score = 0;

  if (normalizedAddress === normalizedInput) score += 100;
  if (normalizedAddress.startsWith(normalizedInput)) score += 80;
  if (normalizedAddress.includes(` ${normalizedInput} `)) score += 60;
  if (normalizedName === normalizedInput) score += 30;
  if (normalizedName.startsWith(normalizedInput)) score += 20;
  if (normalizedName.includes(normalizedInput)) score += 10;
  if (normalizedAddress.includes("paris") && !normalizedInput.includes("paris")) score -= 40;
  if (normalizedAddress.includes("france")) score += 5;
  if (types.includes("locality")) score += 50;
  if (types.includes("postal_town")) score += 45;
  if (types.includes("postal_code")) score += 40;
  if (types.includes("sublocality")) score += 35;
  if (types.includes("administrative_area_level_1")) score += 25;
  if (types.includes("premise") || types.includes("establishment") || types.includes("point_of_interest")) score -= 50;
  if (types.includes("store") || types.includes("lodging") || types.includes("restaurant")) score -= 35;
  if (types.includes("street_address")) score -= 20;
  return score;
}

async function searchPage(query: string, location: ResolvedLocation | null, pageToken?: string): Promise<SearchResponse> {
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
      ...(location
        ? {
            locationBias: {
              circle: {
                center: { latitude: location.latitude, longitude: location.longitude },
                radius: location.radiusMeters,
              },
            },
          }
        : {}),
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

async function autocompleteLocation(input: string) {
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY.includes("your_google")) {
    throw new Error("Mete a tua GOOGLE_API_KEY no ficheiro .env e reinicia o servidor.");
  }

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
    },
    body: JSON.stringify({
      input,
      languageCode: "fr",
      regionCode: "fr",
      includedRegionCodes: ["fr"],
    }),
  });

  const data = (await response.json().catch(() => null)) as { suggestions?: AutocompleteSuggestion[]; error?: { message?: string } } | null;
  if (!response.ok) {
    throw new Error(data?.error?.message || "Autocomplete de localização falhou.");
  }

  return data?.suggestions || [];
}

async function resolveLocationCandidate(input: string): Promise<LocationResolutionAttempt[]> {
  const suggestions = await autocompleteLocation(input);
  const candidates: LocationResolutionAttempt[] = [];

  for (const suggestion of suggestions) {
    const placeId = suggestion.placePrediction?.placeId || null;
    if (!placeId) continue;
    try {
      const place = await fetchPlaceDetails(placeId);
      candidates.push({
        label: place.label || "",
        placeId,
        latitude: place.latitude ?? null,
        longitude: place.longitude ?? null,
        score: scoreLocationCandidate(input, {
          displayName: { text: place.label || "" },
          formattedAddress: place.label || "",
          types: [],
        }),
        placeTypes: [],
      });
    } catch {
      continue;
    }
  }

  return candidates;
}

function isValidLatLng(lat: unknown, lng: unknown) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Number(lat) >= -90 && Number(lat) <= 90 && Number(lng) >= -180 && Number(lng) <= 180;
}

function normalizePostalCodeInput(input: string) {
  const match = input.match(/\b\d{5}\b/);
  return match?.[0] || null;
}

function validateResolvedLocation(input: string, resolved: ResolvedLocation) {
  const normalizedInput = normalizeText(input);
  const normalizedLabel = normalizeText(resolved.label || "");
  const postalCode = normalizePostalCodeInput(input);

  if (postalCode) {
    if (!normalizedLabel.includes(postalCode) && !normalizedLabel.includes("paris")) {
      throw new Error("Location resolution mismatch");
    }
    return;
  }

  const tokens = normalizedInput.split(" ").filter(Boolean);
  const sameCity = tokens.some((token) => normalizedLabel.includes(token));
  if (!sameCity) {
    throw new Error("Location resolution mismatch");
  }
  if (normalizedInput !== normalizedLabel && normalizedLabel.includes("paris") && !normalizedInput.includes("paris")) {
    throw new Error("Location resolution mismatch");
  }
}

async function fetchPlaceDetails(placeId: string) {
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY.includes("your_google")) {
    throw new Error("Mete a tua GOOGLE_API_KEY no ficheiro .env e reinicia o servidor.");
  }

  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
    },
  });
  const data = (await response.json().catch(() => null)) as
    | { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number }; error?: { message?: string } }
    | null;

  const lat = data?.location?.latitude;
  const lng = data?.location?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new Error(data?.error?.message || "A localização devolvida não tem coordenadas válidas.");
  }

  return {
    placeId: data?.id || placeId,
    latitude: lat,
    longitude: lng,
    label: data?.formattedAddress || data?.displayName?.text || placeId,
  };
}

async function resolveLocation(body: SearchRequest): Promise<ResolvedLocation | null> {
  const radiusRaw = Number(body.radius);
  const radiusMeters = ALLOWED_RADIUS_METERS.has(radiusRaw) ? radiusRaw : NaN;
  if (!Number.isFinite(radiusMeters)) {
    throw new Error("Invalid radius");
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (isValidLatLng(lat, lng)) {
    return {
      latitude: lat,
      longitude: lng,
      radiusMeters,
      source: "coordinates",
      label: body.locationText?.trim() || null,
      placeId: body.placeId?.trim() || null,
    };
  }

  if (body.placeId?.trim()) {
    const resolved = await fetchPlaceDetails(body.placeId.trim());
    const next = { ...resolved, radiusMeters, source: "place_id" as const };
    validateResolvedLocation(body.locationText || resolved.label || body.placeId, next);
    return next;
  }

  const locationText = body.locationText?.trim();
  if (locationText) {
    const ranked = (await resolveLocationCandidate(locationText))
      .filter((candidate) => isValidLatLng(candidate.latitude, candidate.longitude))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (!best || !isValidLatLng(best.latitude, best.longitude) || best.score < 10) {
      throw new Error("Unable to resolve location");
    }

    const resolved = {
      latitude: Number(best.latitude),
      longitude: Number(best.longitude),
      radiusMeters,
      source: "text" as const,
      label: best.label || locationText,
      placeId: best.placeId,
    };
    validateResolvedLocation(locationText, resolved);
    return resolved;
  }

  throw new Error("Unable to resolve location");
}

function distanceKm(a: { latitude: number; longitude: number }, b: { latitude?: number; longitude?: number }) {
  if (typeof b.latitude !== "number" || typeof b.longitude !== "number") return null;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function searchBusinesses(query: string, location: ResolvedLocation | null) {
  const seen = new Set<string>();
  const results: GooglePlace[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await searchPage(query, location, pageToken);
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

  if (!location) return results;
  const filtered = results.filter((place) => {
    if (!place.location || typeof place.location.latitude !== "number" || typeof place.location.longitude !== "number") return false;
    const km = distanceKm({ latitude: location.latitude, longitude: location.longitude }, place.location);
    return km !== null && km <= location.radiusMeters / 1000;
  });
  logStep("PLACES AFTER RADIUS FILTER", { before: results.length, after: filtered.length });
  return filtered;
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
    const body = (await request.json().catch(() => ({}))) as SearchRequest;
    const query = String(body.query || "").trim();
    const detectEmails = body.detectEmails !== false;
    console.log("[FIND-SITES] LOCATION INPUT", {
      locationText: body.locationText ?? null,
      placeId: body.placeId ?? null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      radius: body.radius ?? null,
    });
    const location = await resolveLocation(body);
    const radiusKm = location ? location.radiusMeters / 1000 : null;

    if (query.length < 3) {
      return NextResponse.json({ error: "Escreve uma pesquisa. Ex: coiffeur Rennes 3" }, { status: 400 });
    }

    console.log("[FIND-SITES] LOCATION RESOLVED", {
      locationText: body.locationText || null,
      placeId: body.placeId || null,
      lat: location?.latitude ?? null,
      lng: location?.longitude ?? null,
      radiusKm,
      resolvedLabel: location?.label ?? null,
      source: location?.source ?? null,
    });

    console.log("[FIND-SITES] GOOGLE REQUEST", {
      query,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      radiusMeters: location ? location.radiusMeters : null,
      page: 1,
    });

    const searchText = query;
    const places = await searchBusinesses(searchText, location);
    console.log("[FIND-SITES] PLACES RECEIVED", {
      count: places.length,
      center: location ? { lat: location.latitude, lng: location.longitude } : null,
      radiusKm,
    });
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
      location,
      placeId: location?.placeId || null,
      searchText,
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
