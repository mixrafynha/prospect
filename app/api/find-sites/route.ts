import { NextResponse } from "next/server";
import { buildWeakScore } from "@/lib/scoring";
import { dedupePhones, normalizeFrenchPhone } from "@/lib/phone";
import { enrichWebsiteContacts } from "@/lib/websiteEnrichment";
import { safePublicUrl } from "@/lib/safeFetch";
import type { Lead, PhoneNumberData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  includeAnalysis?: boolean;
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
const PAGE_SIZE = 15;
const LEAD_CONCURRENCY = 4;
const DEFAULT_RADIUS_METERS = 10000;
const ALLOWED_RADIUS_METERS = new Set([2000, 5000, 10000, 20000, 50000]);

function logStep(step: string, data?: unknown) {
  console.log(`[FIND-SITES] ${step}`, data ?? "");
}

function makeSearchId() {
  return `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function locationRestriction(location: ResolvedLocation) {
  const radiusKm = location.radiusMeters / 1000;
  const latitudeDelta = radiusKm / 111.32;
  const longitudeScale = Math.max(Math.cos((location.latitude * Math.PI) / 180), 0.1);
  const longitudeDelta = radiusKm / (111.32 * longitudeScale);

  return {
    rectangle: {
      low: {
        latitude: Math.max(-90, location.latitude - latitudeDelta),
        longitude: Math.max(-180, location.longitude - longitudeDelta),
      },
      high: {
        latitude: Math.min(90, location.latitude + latitudeDelta),
        longitude: Math.min(180, location.longitude + longitudeDelta),
      },
    },
  };
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

async function searchPage(query: string, location: ResolvedLocation | null, pageToken?: string, page = 1, searchId?: string): Promise<SearchResponse> {
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
      pageSize: PAGE_SIZE,
      ...(location
        ? {
            locationRestriction: locationRestriction(location),
          }
        : {}),
      ...(pageToken ? { pageToken } : {}),
    }),
  });
  logStep("GOOGLE REQUEST", {
    searchId: searchId || null,
    page,
    query,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    radiusMeters: location ? location.radiusMeters : null,
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

function normalizeCoordinates(place: GooglePlace) {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (!isValidLatLng(lat, lng)) return null;
  return { latitude: Number(lat), longitude: Number(lng) };
}

async function resolveLocation(body: SearchRequest): Promise<ResolvedLocation | null> {
  const radiusRaw = Number(body.radius);
  const radiusMeters = ALLOWED_RADIUS_METERS.has(radiusRaw) ? radiusRaw : DEFAULT_RADIUS_METERS;

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

function placeDistanceKm(location: ResolvedLocation, place: GooglePlace) {
  const coordinates = normalizeCoordinates(place);
  if (!coordinates) return null;
  return distanceKm({ latitude: location.latitude, longitude: location.longitude }, coordinates);
}

function leadSortDistance(lead: Lead) {
  return typeof lead.distanceKm === "number" ? lead.distanceKm : Number.POSITIVE_INFINITY;
}

async function searchBusinesses(query: string, location: ResolvedLocation | null, searchId: string) {
  const seen = new Set<string>();
  const results: GooglePlace[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await searchPage(query, location, pageToken, page + 1, searchId);
    for (const place of data.places || []) {
      const id = place.id || `${place.displayName?.text || ""}|${place.formattedAddress || ""}`;
      if (seen.has(id)) continue;
      seen.add(id);
      results.push(place);
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (!location) return results;
  const filtered = results.filter((place) => {
    const coordinates = normalizeCoordinates(place);
    if (!coordinates) {
      logStep("PLACE_WITHOUT_LOCATION", { name: place.displayName?.text || null, placeId: place.id || null });
      return false;
    }
    const km = distanceKm({ latitude: location.latitude, longitude: location.longitude }, coordinates);
    const accepted = km !== null && km <= location.radiusMeters / 1000;
    logStep("DISTANCE", {
      name: place.displayName?.text || null,
      placeId: place.id || null,
      distanceKm: km,
      radiusKm: location.radiusMeters / 1000,
      accepted,
    });
    return accepted;
  });
  filtered.sort((a, b) => {
    const da = placeDistanceKm(location, a) ?? Number.POSITIVE_INFINITY;
    const db = placeDistanceKm(location, b) ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    const ra = typeof a.rating === "number" ? a.rating : 0;
    const rb = typeof b.rating === "number" ? b.rating : 0;
    if (ra !== rb) return rb - ra;
    const va = typeof a.userRatingCount === "number" ? a.userRatingCount : 0;
    const vb = typeof b.userRatingCount === "number" ? b.userRatingCount : 0;
    return vb - va;
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

function locationKey(value: { latitude?: number | null; longitude?: number | null } | null | undefined) {
  if (!value || typeof value.latitude !== "number" || typeof value.longitude !== "number") return "";
  return `${value.latitude.toFixed(4)}|${value.longitude.toFixed(4)}`;
}

function nameAddressKey(name: string, address: string) {
  return `${normalizeText(name)}|${normalizeText(address)}`;
}

function dedupeLeads(leads: Lead[]) {
  const byPlace = new Map<string, Lead>();
  const byPhone = new Map<string, Lead>();
  const byWebsiteLocation = new Map<string, Lead>();
  const byNameAddress = new Map<string, Lead>();
  const byNameLocation = new Map<string, Lead>();
  const output: Lead[] = [];

  for (const lead of leads) {
    const placeKey = lead.placeId || "";
    const phoneKey = lead.phones.find((phone) => phone.normalizedE164)?.normalizedE164 || "";
    const websiteKey = `${normalizeDomain(lead.website) || ""}|${lead.location?.latitude ?? ""}|${lead.location?.longitude ?? ""}`;
    const nameAddress = nameAddressKey(lead.name, lead.address);
    const nameLocation = `${normalizeText(lead.name)}|${locationKey(lead.location)}`;
    const existing =
      (placeKey && byPlace.get(placeKey)) ||
      (phoneKey && byPhone.get(phoneKey)) ||
      byWebsiteLocation.get(websiteKey) ||
      byNameAddress.get(nameAddress) ||
      byNameLocation.get(nameLocation);

    if (!existing) {
      output.push(lead);
      if (placeKey) byPlace.set(placeKey, lead);
      if (phoneKey) byPhone.set(phoneKey, lead);
      byWebsiteLocation.set(websiteKey, lead);
      byNameAddress.set(nameAddress, lead);
      byNameLocation.set(nameLocation, lead);
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
    byWebsiteLocation.set(websiteKey, merged);
    byNameAddress.set(nameAddress, merged);
    byNameLocation.set(nameLocation, merged);
  }

  return output;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = (await request.json().catch(() => ({}))) as SearchRequest;
    const query = String(body.query || "").trim();
    const searchId = makeSearchId();
    const detectEmails = body.detectEmails !== false;
    const includeAnalysis = body.includeAnalysis === true;
    console.log("[FIND-SITES] LOCATION INPUT", {
      searchId,
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
      searchId,
      locationText: body.locationText || null,
      placeId: body.placeId || null,
      lat: location?.latitude ?? null,
      lng: location?.longitude ?? null,
      radiusKm,
      resolvedLabel: location?.label ?? null,
      source: location?.source ?? null,
    });

    console.log("[FIND-SITES] GOOGLE REQUEST", {
      searchId,
      query,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      radiusMeters: location ? location.radiusMeters : null,
      page: 1,
    });

    const searchText = query;
    const places = await searchBusinesses(searchText, location, searchId);
    console.log("[FIND-SITES] PLACES RECEIVED", {
      count: places.length,
      center: location ? { lat: location.latitude, lng: location.longitude } : null,
      radiusKm,
    });
    async function processPlace(place: GooglePlace, index: number): Promise<Lead> {
      const name = place.displayName?.text || "Sem nome";
      const googleWebsiteUri = place.websiteUri || null;
      logStep(`Processing ${index + 1}/${places.length}`, { searchId, name, website: googleWebsiteUri || "sem site" });

      const websiteResult = includeAnalysis && googleWebsiteUri
        ? await enrichWebsiteContacts(googleWebsiteUri)
        : { email: null, emailSource: null, phones: [], checkedEmailPages: [], checkedPhonePages: [], finalUrl: null };

      const resolvedWebsiteUri = websiteResult.finalUrl || null;
      const websiteMismatch = Boolean(googleWebsiteUri && resolvedWebsiteUri && normalizeDomain(googleWebsiteUri) !== normalizeDomain(resolvedWebsiteUri));
      const websiteFinal = websiteMismatch ? googleWebsiteUri : resolvedWebsiteUri || googleWebsiteUri;
      const website = websiteFinal || "";

      const metrics = includeAnalysis && website
        ? await checkPageSpeed(website)
        : { performance: 0, seo: 0, accessibility: 0, bestPractices: 0, auditAvailable: false, auditError: null, auditDetails: [] };

      const googlePhones = phonesFromPlace(place);
      const phones = dedupePhones([...googlePhones, ...(websiteResult.phones || [])]);
      const mobilePhones = phones.filter((phone) => isMobile(phone));

      const base = {
        placeId: place.id || null,
        searchOrder: index,
        name,
        address: place.formattedAddress || "",
        website,
        googleWebsiteUri,
        resolvedWebsiteUri,
        websiteFinal,
        websiteMismatch,
        maps: place.googleMapsUri || "",
        businessStatus: place.businessStatus || null,
        primaryType: place.primaryType || null,
        types: place.types || [],
        location: normalizeCoordinates(place),
        distanceKm: location ? placeDistanceKm(location, place) : null,
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

      return { ...base, ...buildWeakScore(base) };
    }

    const leads: Lead[] = [];
    const concurrency = includeAnalysis ? LEAD_CONCURRENCY : Math.max(6, LEAD_CONCURRENCY);
    for (let start = 0; start < places.length; start += concurrency) {
      const batch = places.slice(start, start + concurrency);
      const processed = await Promise.all(batch.map((place, offset) => processPlace(place, start + offset)));
      leads.push(...processed);
    }

    const deduped = dedupeLeads(leads);
    deduped.sort((a, b) => {
      const distanceDelta = leadSortDistance(a) - leadSortDistance(b);
      if (distanceDelta !== 0) return distanceDelta;
      const relevanceDelta = ((a.searchOrder ?? 0) - (b.searchOrder ?? 0));
      if (relevanceDelta !== 0) return relevanceDelta;
      const ratingDelta = (b.rating || 0) - (a.rating || 0);
      if (ratingDelta !== 0) return ratingDelta;
      const reviewsDelta = (b.userRatingCount || 0) - (a.userRatingCount || 0);
      if (reviewsDelta !== 0) return reviewsDelta;
      return Number(b.hasMobilePhone) - Number(a.hasMobilePhone) || Number(b.hasWebsiteMobilePhone) - Number(a.hasWebsiteMobilePhone) || b.weakScore - a.weakScore;
    });

    return NextResponse.json({
      searchId,
      query,
      location,
      placeId: location?.placeId || null,
      searchText,
      total: deduped.length,
      pagination: { maxPages: MAX_PAGES, pageSize: PAGE_SIZE, supportedByApi: true },
      leads: deduped,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[FIND-SITES] API ERROR:", { message, stack: error instanceof Error ? error.stack : null, durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
