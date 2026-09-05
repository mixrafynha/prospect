"use client";

import { ArrowRight, Bookmark, Check, Copy, ExternalLink, Eye, Globe, Mail, MapPin, MessageSquare, Search, Phone, PanelRightOpen, Sparkles, Star, Layers3, Target, X, Map } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import Reveal from "@/components/Reveal";
import type { Lead, PhoneNumberData } from "@/lib/types";
import { buildSmsHref, buildSmsLink, buildSmsMessage, buildSmsMessageVariants, type SmsMessageVariant } from "@/lib/smsTemplate";
import SmsQr from "@/components/SmsQr";
import { getFrenchPhoneVariants, loadOutreachHistory, normalizeFrenchPhoneForSearch, upsertOutreachContact, updateOutreachStatus, type OutreachHistoryItem } from "@/lib/leads/outreachHistory";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function phoneLabel(phone: PhoneNumberData) {
  if (!phone.valid) return "INVALID";
  if (phone.type === "mobile") return "MOBILE";
  if (phone.type === "landline") return "LANDLINE";
  if (phone.type === "non-geographic") return "NON-GEOGRAPHIC";
  if (phone.type === "special") return "SPECIAL";
  return "UNKNOWN";
}

function phonePriority(phone: PhoneNumberData) {
  const normalized = phone.normalizedNational?.replace(/\s+/g, "") || "";
  if (normalized.startsWith("06") || normalized.startsWith("07")) return 0;
  if (phone.valid) return 1;
  return 2;
}

function leadHas06(lead: Lead) {
  return lead.mobilePhones.some((phone) => phone.valid && phone.normalizedNational?.replace(/\s+/g, "").startsWith("06"));
}

function leadHas07(lead: Lead) {
  return lead.mobilePhones.some((phone) => phone.valid && phone.normalizedNational?.replace(/\s+/g, "").startsWith("07"));
}

function leadHasMobile(lead: Lead) {
  return leadHas06(lead) || leadHas07(lead);
}

function leadPhotoUrl(lead: Lead) {
  return lead.photoName ? `/api/place-photo?name=${encodeURIComponent(lead.photoName)}` : null;
}

type LeadStatus = "new" | "viewed" | "contacted";

function loadLeadStatus() {
  if (typeof window === "undefined") return {} as Record<string, LeadStatus>;
  try {
    return JSON.parse(localStorage.getItem("lead-status-map") || "{}") as Record<string, LeadStatus>;
  } catch {
    return {};
  }
}

function saveLeadStatus(statusMap: Record<string, LeadStatus>) {
  localStorage.setItem("lead-status-map", JSON.stringify(statusMap));
}

function loadSelectedLeadKey() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("selected-lead-key") || "";
}

function saveSelectedLeadKey(value: string) {
  localStorage.setItem("selected-lead-key", value);
}

const SESSION_KEY = "leads-workspace-session-v1";
const LEGACY_SESSION_KEY = "leads-workspace-session-v1-legacy";

type WorkspaceSession = {
  query?: string;
  location?: string;
  radius?: number;
  leads?: Lead[];
  step?: string;
  error?: string;
  activeSearchLocation?: { label: string; radiusMeters: number; latitude: number | null; longitude: number | null } | null;
};

function loadWorkspaceSession(): WorkspaceSession {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(LEGACY_SESSION_KEY) || "{}";
    return JSON.parse(raw) as WorkspaceSession;
  } catch {
    return {};
  }
}

function saveWorkspaceSession(value: WorkspaceSession) {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(value);
  sessionStorage.setItem(SESSION_KEY, raw);
}

function leadKey(lead: Lead) {
  if (lead.placeId) return `place:${lead.placeId}`;
  const phone = lead.phones.find((item) => item.normalizedE164)?.normalizedE164;
  if (phone) return `phone:${phone}`;
  return `lead:${lead.name.trim().toLowerCase()}|${lead.address.trim().toLowerCase()}`;
}

function leadStatusClass(status: LeadStatus) {
  if (status === "contacted") return "contacted";
  if (status === "viewed") return "viewed";
  return "new";
}

function statusLabel(status: LeadStatus) {
  if (status === "contacted") return "Contacted";
  if (status === "viewed") return "Viewed";
  return "New";
}

function outreachStatusLabel(status?: string | null) {
  if (status === "contacted") return "Contactado";
  if (status === "replied") return "Respondeu";
  if (status === "interested") return "Interessado";
  if (status === "client") return "Cliente";
  if (status === "not_interested") return "Sem interesse";
  return "Novo";
}

function outreachStatusWeight(status?: string | null) {
  if (status === "replied") return 3;
  if (status === "interested") return 2;
  if (status === "client") return 4;
  if (status === "contacted") return 1;
  if (status === "not_interested") return 0;
  return -1;
}

export default function LeadsWorkspace() {
  const [query, setQuery] = useState("Institut de beauté");
  const [location, setLocation] = useState("Rennes");
  const [radius, setRadius] = useState(10000);
  const [activeSearchLocation, setActiveSearchLocation] = useState<{ label: string; radiusMeters: number; latitude: number | null; longitude: number | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("Ready to search.");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [phoneFilter, setPhoneFilter] = useState<"all" | "06" | "07" | "06-07" | "no-mobile" | "no-website" | "has-website">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");
  const [sortMode, setSortMode] = useState<"opportunity" | "mobiles" | "reviews" | "rating">("opportunity");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [leadStatusMap, setLeadStatusMap] = useState<Record<string, LeadStatus>>({});
  const [smsLead, setSmsLead] = useState<Lead | null>(null);
  const [smsMessage, setSmsMessage] = useState("");
  const [smsVariantId, setSmsVariantId] = useState("");
  const [messageCopied, setMessageCopied] = useState(false);
  const [numberCopied, setNumberCopied] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [contactedPhoneSet, setContactedPhoneSet] = useState<Set<string>>(new Set());
  const [outreachItems, setOutreachItems] = useState<OutreachHistoryItem[]>([]);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const session = loadWorkspaceSession();
    if (session.query) setQuery(session.query);
    if (session.location) setLocation(session.location);
    if (typeof session.radius === "number") setRadius(session.radius);
    if (Array.isArray(session.leads)) setLeads(session.leads);
    if (session.step) setStep(session.step);
    if (session.error) setError(session.error);
    if (session.activeSearchLocation !== undefined) setActiveSearchLocation(session.activeSearchLocation || null);
    setSessionHydrated(true);
  }, []);

  useEffect(() => {
    const items = loadOutreachHistory();
    setOutreachItems(items);
    setContactedPhoneSet(new Set(items.flatMap((item) => getFrenchPhoneVariants(item.phone).concat(item.normalizedPhone))));
  }, []);

  function refreshOutreachItems(nextItems?: OutreachHistoryItem[]) {
    const items = nextItems || loadOutreachHistory();
    setOutreachItems(items);
    setContactedPhoneSet(new Set(items.flatMap((item) => getFrenchPhoneVariants(item.phone).concat(item.normalizedPhone))));
  }

  useEffect(() => {
    if (!sessionHydrated) return;
    saveWorkspaceSession({ query, location, radius, leads, step, error, activeSearchLocation });
  }, [query, location, radius, leads, step, error, activeSearchLocation, sessionHydrated]);

  const filtered = useMemo(() => {
    const rows = [...leads];
    const filteredRows = rows.filter((lead) => {
      const has06 = leadHas06(lead);
      const has07 = leadHas07(lead);
      const status = leadStatusMap[leadKey(lead)] || "new";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (phoneFilter === "06") return has06 && !has07;
      if (phoneFilter === "07") return has07 && !has06;
      if (phoneFilter === "06-07") return has06 && has07;
      if (phoneFilter === "no-mobile") return !has06 && !has07;
      if (phoneFilter === "no-website") return !lead.website;
      if (phoneFilter === "has-website") return Boolean(lead.website);
      return true;
    });

    filteredRows.sort((a, b) => {
      if (sortMode === "mobiles") return Number(leadHasMobile(b)) - Number(leadHasMobile(a)) || b.weakScore - a.weakScore;
      if (sortMode === "reviews") return (b.userRatingCount || 0) - (a.userRatingCount || 0);
      if (sortMode === "rating") return (b.rating || 0) - (a.rating || 0);
      return Number(leadHasMobile(b)) - Number(leadHasMobile(a)) || b.weakScore - a.weakScore;
    });

    return filteredRows;
  }, [leads, phoneFilter, sortMode, statusFilter, leadStatusMap]);

  async function searchLeads() {
    setLoading(true);
    setError("");
    setStep("Searching Google Maps...");
    setSelectedLead(null);
    setLeads([]);
    setActiveSearchLocation(null);

    try {
      setTimeout(() => setStep("Finding contact information..."), 900);
      setTimeout(() => setStep("Analyzing websites..."), 1700);
      setTimeout(() => setStep("Preparing results..."), 2400);

      const response = await fetch("/api/find-sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, locationText: location, radius, detectEmails: true, includeAnalysis: false }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao procurar leads");
      setLeads(data.leads || []);
      setActiveSearchLocation(
        data.location?.label
          ? { label: data.location.label, radiusMeters: data.location.radiusMeters || radius, latitude: data.location.latitude ?? null, longitude: data.location.longitude ?? null }
          : { label: location, radiusMeters: radius, latitude: null, longitude: null }
      );
      setStep(`Found ${data.leads?.length || 0} businesses.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      setStep("Search failed.");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const rows = filtered.map((lead) => [
      lead.name,
      lead.address,
      lead.website,
      lead.maps,
      lead.rating ?? "",
      lead.userRatingCount ?? "",
      lead.phones.map((phone) => phone.normalizedNational || phone.original).join(" | "),
      lead.phones.map((phone) => phone.normalizedE164 || "").join(" | "),
      lead.phones.map((phone) => phone.type).join(" | "),
      lead.phones.map((phone) => phone.source).join(" | "),
      lead.hasMobilePhone ? "yes" : "no",
      lead.mobilePhones.map((phone) => phone.prefix || "").join(" | "),
      lead.weakScore,
    ].map(csvEscape).join(","));

    const csv = [
      "Business,Address,Website,Google Maps,Rating,Review Count,Phone,Phone E164,Phone Type,Phone Source,Has Mobile,Mobile Prefix,Weak Score",
      ...rows,
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${query.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const stats = useMemo(() => ({
    total: filtered.length,
    mobile: filtered.filter((lead) => lead.hasMobilePhone).length,
    noWebsite: filtered.filter((lead) => !lead.website).length,
  }), [filtered]);

  const weakWebsiteCount = useMemo(() => filtered.filter((lead) => !lead.website || !/^https?:\/\//i.test(lead.website || "")).length, [filtered]);
  const goodWebsiteCount = useMemo(() => filtered.filter((lead) => Boolean(lead.website && /^https?:\/\//i.test(lead.website))).length, [filtered]);
  const openNowCount = useMemo(() => filtered.filter((lead) => lead.businessStatus?.toLowerCase().includes("oper") || lead.businessStatus?.toLowerCase().includes("open")).length, [filtered]);
  const photosCount = useMemo(() => filtered.filter((lead) => Boolean((lead as { photosCount?: number }).photosCount || (lead as { photoCount?: number }).photoCount)).length, [filtered]);

  const currentPhones = useMemo(() => {
    if (!selectedLead) return [];
    return [...selectedLead.phones].sort((a, b) => phonePriority(a) - phonePriority(b));
  }, [selectedLead]);

  useEffect(() => {
    setLeadStatusMap(loadLeadStatus());
    setSmsMessage(buildSmsMessage({ name: "votre entreprise", address: "", website: "" } as Lead));
    const mq = window.matchMedia("(min-width: 981px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!selectedLead) return;
    const key = leadKey(selectedLead);
    setLeadStatusMap((current) => {
      const next: Record<string, LeadStatus> = { ...current, [key]: current[key] === "contacted" ? "contacted" : "viewed" };
      saveLeadStatus(next);
      return next;
    });
    saveSelectedLeadKey(key);
  }, [selectedLead]);

  async function copyPhone(phone: PhoneNumberData) {
    const value = phone.normalizedE164 || phone.normalizedNational || phone.original;
    await navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(""), 1300);
  }

  function primaryPhoneForLead(lead: Lead) {
    return [...lead.phones].sort((a, b) => phonePriority(a) - phonePriority(b)).find((phone) => phone.valid && phone.normalizedE164);
  }

  function updateLeadStatus(lead: Lead, nextStatus: LeadStatus) {
    const key = leadKey(lead);
    setLeadStatusMap((current) => {
      const next = { ...current, [key]: nextStatus };
      saveLeadStatus(next);
      return next;
    });
  }

  function closeProspect() {
    setSmsLead(null);
    setMessageCopied(false);
    setNumberCopied(false);
  }

  function openProspect(lead: Lead) {
    setSelectedLead(lead);
    setSmsLead(lead);
    const firstVariant = buildSmsMessageVariants(lead)[0];
    setSmsVariantId(firstVariant?.id || "");
    setSmsMessage(firstVariant?.text || buildSmsMessage(lead));
  }

  function markContactedBySms(lead: Lead, message: string, variantId = smsVariantId) {
    const phone = primaryPhoneForLead(lead);
    if (!phone?.normalizedE164) return;
    upsertOutreachContact(
      {
        id: lead.placeId || `${lead.name}-${lead.address}`,
        companyName: lead.name,
        phone: phone.normalizedE164,
        website: lead.website,
        location: lead.address,
        latitude: lead.location?.latitude ?? null,
        longitude: lead.location?.longitude ?? null,
        leadStatus: "contacted",
      },
      { phone: phone.normalizedE164, message, variantId: variantId || "custom" }
    );
    refreshOutreachItems();
  }

  function outreachForLead(lead: Lead) {
    const phone = primaryPhoneForLead(lead);
    const leadId = lead.placeId || `${lead.name}-${lead.address}`;
    const normalized = phone?.normalizedE164 ? normalizeFrenchPhoneForSearch(phone.normalizedE164) : "";
    return outreachItems.find((item) => item.leadId === leadId || item.normalizedPhone === normalized || getFrenchPhoneVariants(item.phone).includes(normalized)) || null;
  }

  function lastContactLabel(item: OutreachHistoryItem | null) {
    return item?.contactAt ? new Date(item.contactAt).toLocaleDateString("fr-FR") : "—";
  }

  async function copyMessage() {
    await navigator.clipboard.writeText(smsMessage);
    setMessageCopied(true);
    setTimeout(() => setMessageCopied(false), 1200);
  }

  async function copyNumber(lead: Lead) {
    const primary = [...lead.phones].find((phone) => phone.valid && phone.normalizedE164);
    if (!primary?.normalizedE164) return;
    await navigator.clipboard.writeText(primary.normalizedE164);
    setNumberCopied(true);
    setTimeout(() => setNumberCopied(false), 1200);
  }

  async function openSmsComposer(lead: Lead, message = smsMessage, options?: { preferFallback?: boolean }) {
    const phone = primaryPhoneForLead(lead);
    if (!phone?.normalizedE164) return false;
    const existing = outreachForLead(lead);
    if (existing?.contactAt) {
      const proceed = window.confirm(`Déjà contacté le ${new Date(existing.contactAt).toLocaleDateString("fr-FR")}. Continuer quand même ?`);
      if (!proceed) return false;
    }
    const selectedVariantId = buildSmsMessageVariants(lead).find((variant) => variant.text === message)?.id || smsVariantId || "custom";
    markContactedBySms(lead, message, selectedVariantId);

    const smsWithBody = buildSmsLink(phone.normalizedE164, message, { includeBody: true });
    const smsWithoutBody = buildSmsLink(phone.normalizedE164, message, { includeBody: false });

    try {
      if (options?.preferFallback) {
        await navigator.clipboard.writeText(message);
        setMessageCopied(true);
        setTimeout(() => setMessageCopied(false), 1200);
        window.location.href = smsWithoutBody;
        return true;
      }

      window.location.href = smsWithBody;
      return true;
    } catch {
      try {
        await navigator.clipboard.writeText(smsMessage);
        setMessageCopied(true);
        setTimeout(() => setMessageCopied(false), 1200);
      } catch {
        // Clipboard may be blocked; still open recipient-only SMS.
      }
      window.location.href = smsWithoutBody;
      return false;
    }
  }

  function goToNextProspect() {
    if (!filtered.length) return;
    const currentKey = smsLead ? leadKey(smsLead) : selectedLead ? leadKey(selectedLead) : loadSelectedLeadKey();
    const sorted = [...filtered].sort((a, b) => {
      const aStatus = leadStatusMap[leadKey(a)] || "new";
      const bStatus = leadStatusMap[leadKey(b)] || "new";
      if (aStatus !== bStatus) {
        const weight = { new: 0, viewed: 1, contacted: 2 } as const;
        return weight[aStatus] - weight[bStatus];
      }
      const mobileDelta = Number(leadHasMobile(b)) - Number(leadHasMobile(a));
      if (mobileDelta !== 0) return mobileDelta;
      return b.weakScore - a.weakScore;
    });

    const currentIndex = sorted.findIndex((lead) => leadKey(lead) === currentKey);
    const nextLead = sorted[currentIndex >= 0 ? currentIndex + 1 : 0] || sorted[0];
    if (!nextLead) return;
    updateLeadStatus(nextLead, leadStatusMap[leadKey(nextLead)] === "contacted" ? "contacted" : "viewed");
    setSelectedLead(nextLead);
    setSmsLead(nextLead);
    const firstVariant = buildSmsMessageVariants(nextLead)[0];
    setSmsVariantId(firstVariant?.id || "");
    setSmsMessage(firstVariant?.text || buildSmsMessage(nextLead));
  }

  function selectSmsVariant(variant: SmsMessageVariant) {
    setSmsVariantId(variant.id);
    setSmsMessage(variant.text);
    setMessageCopied(false);
  }

  function changeOutreachStatus(lead: Lead, status: "replied" | "interested" | "client" | "not_interested") {
    const item = outreachForLead(lead);
    if (!item) return;
    refreshOutreachItems(updateOutreachStatus(item.id, status));
  }

  function websiteStatusForLead(lead: Lead) {
    if (!lead.website) return "no website";
    if (lead.weakScore >= 60) return "good website";
    return "weak website";
  }

  function websitePillClass(lead: Lead) {
    if (!lead.website) return "badge-pill no-website";
    if (lead.weakScore >= 60) return "badge-pill good-website";
    return "badge-pill weak-website";
  }

  function businessStatusPill(lead: Lead) {
    const status = lead.businessStatus?.toLowerCase() || "";
    if (status.includes("oper")) return "badge-pill operational";
    return "badge-pill subtle";
  }

  function distanceLabel(lead: Lead) {
    const distance = lead.distanceKm;
    if (typeof distance === "number") return `${distance.toFixed(distance < 10 ? 1 : 0)} km`;
    return "—";
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeProspect();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <SiteHeader />
      <main className="workspace">
        <section className="workspace-hero search-hero">
          <Reveal>
            <div className="hero-intro">
              <div className="hero-kicker">FIND LEADS<span className="hero-kicker-accent" /></div>
              <h1>Search businesses by niche and location.</h1>
              <p className="hero-support">Find direct contacts, prioritize 06/07 and focus on businesses with weak or no websites.</p>
            </div>
          </Reveal>

          <Reveal delay={90}>
            <div className="hero-search-stack">
              <div className="search-panel hero-search-panel">
                <div className="search-field hero-field business">
                  <label>Business</label>
                  <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="rénovation" onKeyDown={(e) => e.key === "Enter" && searchLeads()} />
                </div>
                <div className="search-field hero-field location">
                  <label>Location</label>
                  <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Guilvinec, France" onKeyDown={(e) => e.key === "Enter" && searchLeads()} />
                </div>
                <div className="search-field hero-field radius">
                  <label>Radius</label>
                  <select className="input" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
                    <option value={2000}>2 km</option>
                    <option value={5000}>5 km</option>
                    <option value={10000}>10 km</option>
                    <option value={20000}>20 km</option>
                    <option value={50000}>50 km</option>
                  </select>
                </div>
                <button className="button hero-search-button" onClick={searchLeads} disabled={loading}>
                  <Search size={15} /> {loading ? "Searching..." : "Search leads"}
                </button>
              </div>
            </div>
          </Reveal>

          <Reveal delay={140}>
            <div className="hero-metrics">
              <span><Search size={14} /> {stats.total} results</span>
              <span><Phone size={14} /> {stats.mobile} mobile 06/07</span>
              <span><MapPin size={14} /> {Math.round(radius / 1000)} km radius</span>
              <span><Globe size={14} /> {activeSearchLocation?.label || location}</span>
            </div>
          </Reveal>
        </section>

        <section className="results-shell">
          <aside className={filtersOpen ? "filters-sidebar open" : "filters-sidebar"}>
            <div className="filters-sidebar-head">
              <h2>Refine your search</h2>
            </div>
            <div className="filter-group">
              <strong>Website status</strong>
              <button className={phoneFilter === "no-website" ? "filter-option active" : "filter-option"} onClick={() => setPhoneFilter("no-website")}>No website <span>{stats.noWebsite}</span></button>
              <button className={phoneFilter === "all" ? "filter-option active" : "filter-option"} onClick={() => setPhoneFilter("all")}>Weak website <span>{weakWebsiteCount}</span></button>
              <button className={phoneFilter === "has-website" ? "filter-option active" : "filter-option"} onClick={() => setPhoneFilter("has-website")}>Good website <span>{goodWebsiteCount}</span></button>
            </div>
            <div className="filter-group">
              <strong>Phone priority</strong>
              <button className={phoneFilter === "06-07" ? "filter-option active" : "filter-option"} onClick={() => setPhoneFilter("06-07")}>06/07 <span>{stats.mobile}</span></button>
              <button className={phoneFilter === "no-mobile" ? "filter-option active" : "filter-option"} onClick={() => setPhoneFilter("no-mobile")}>Other numbers <span>{Math.max(0, stats.total - stats.mobile)}</span></button>
            </div>
            <div className="filter-group">
              <strong>Rating</strong>
              <button className={sortMode === "rating" ? "filter-option active" : "filter-option"} onClick={() => setSortMode("rating")}>Highest rating</button>
              <button className={sortMode === "reviews" ? "filter-option active" : "filter-option"} onClick={() => setSortMode("reviews")}>Most reviews</button>
              <button className={sortMode === "opportunity" ? "filter-option active" : "filter-option"} onClick={() => setSortMode("opportunity")}>Best opportunities</button>
            </div>
            <div className="filter-group">
              <strong>Open now</strong>
              <button className={sortMode === "mobiles" ? "filter-option active" : "filter-option"} onClick={() => setSortMode("mobiles")}>Open now <span>{openNowCount}</span></button>
              <button className={phoneFilter === "has-website" ? "filter-option active" : "filter-option"} onClick={() => setPhoneFilter("has-website")}>Photos available <span>{photosCount}</span></button>
            </div>
            <div className="filter-group">
              <button className="filter-clear" onClick={() => { setPhoneFilter("all"); setStatusFilter("all"); setSortMode("opportunity"); }}>
                Clear filters
              </button>
            </div>
            <div className="filter-info">
              <strong>Search info</strong>
              <p>{activeSearchLocation?.label || location}</p>
              <p>Lat: {activeSearchLocation?.latitude ?? "—"}</p>
              <p>Lng: {activeSearchLocation?.longitude ?? "—"}</p>
              <p>Radius: {activeSearchLocation ? Math.round(activeSearchLocation.radiusMeters / 1000) : Math.round(radius / 1000)} km</p>
            </div>
          </aside>

          <div className="results-column">
            <div className="results-head">
              <div>
                <h2>{stats.total} results</h2>
                <span className="sorted-pill">Sorted by relevance</span>
              </div>
              <div className="results-head-actions">
                <button className="filters-toggle" onClick={() => setFiltersOpen((value) => !value)}>Filters</button>
                <select className="sort-select" value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}>
                  <option value="opportunity">Most relevant</option>
                  <option value="mobiles">06/07 first</option>
                  <option value="reviews">Most reviews</option>
                  <option value="rating">Highest rating</option>
                </select>
              </div>
            </div>
            <div className="results-list">
            {loading && (
              <div className="loading-stack">
                <div>Searching Google Maps...</div>
                <div>Finding contact information...</div>
                <div>Analyzing websites...</div>
                <div>Preparing results...</div>
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="empty-state">
                <strong>No businesses found.</strong>
                <p>Try another location or a broader business category.</p>
              </div>
            )}

            {filtered.map((lead, index) => {
              const primaryPhone = primaryPhoneForLead(lead);
              const status = leadStatusMap[leadKey(lead)] || "new";
              const normalizedPhone = primaryPhone?.normalizedE164 ? normalizeFrenchPhoneForSearch(primaryPhone.normalizedE164) : "";
              const outreach = outreachForLead(lead);
              const isContacted = Boolean(outreach || (normalizedPhone && contactedPhoneSet.has(normalizedPhone)));
              return (
                <Reveal key={`${lead.placeId || lead.name}-${index}`} delay={Math.min(index * 24, 120)}>
                  <article className={`${selectedLead?.placeId === lead.placeId ? "lead-row active" : "lead-row"} ${leadStatusClass(status)} ${isContacted ? "contacted" : ""}`} onClick={() => setSelectedLead(lead)}>
                    <div className="lead-row-grid">
                      <div className="lead-photo" aria-hidden="true">
                        {leadPhotoUrl(lead) ? <img src={leadPhotoUrl(lead) || undefined} alt="" loading="lazy" /> : <span>{lead.name.slice(0, 1).toUpperCase()}</span>}
                      </div>
                      <div className="lead-col lead-col-identity">
                        <div className="lead-rank">
                          <span>{index + 1}</span>
                          <div className="lead-logo">{(lead.name || "B").slice(0, 2).toUpperCase()}</div>
                        </div>
                <div className="lead-main-title">
                  <h3>{lead.name}</h3>
                  <p className="lead-subtitle">{lead.primaryType || "local business"}</p>
                  <p className="lead-address"><MapPin size={13} /> {lead.address}</p>
                  <p className="lead-address"><Map size={13} /> {distanceLabel(lead)}</p>
                  <div className="lead-mini-metrics">
                    {lead.maps ? <span className="meta-inline"><Globe size={12} /> Google</span> : null}
                    {lead.website ? <span className="meta-inline"><Globe size={12} /> Website</span> : null}
                  </div>
                </div>
                      </div>

                      <div className="lead-col lead-col-info">
                        <div className="lead-meta-line">
                          <span className="lead-rating"><Star size={14} /> {lead.rating ?? "—"} <span>({lead.userRatingCount ?? 0} avis)</span></span>
                          <span className={businessStatusPill(lead)}>{lead.businessStatus || "UNKNOWN"}</span>
                          <span className={websitePillClass(lead)}>{websiteStatusForLead(lead).toUpperCase()}</span>
                        </div>
                        <div className="lead-badge-row">
                          <span className="meta-inline"><Sparkles size={12} /> {lead.primaryType || "local business"}</span>
                          {leadHas06(lead) ? <span className="meta-inline"><Phone size={12} /> 06</span> : null}
                          {leadHas07(lead) ? <span className="meta-inline"><Phone size={12} /> 07</span> : null}
                          {outreach?.contactAt ? <span className="meta-inline"><Check size={12} /> Contacted {lastContactLabel(outreach)}</span> : null}
                        </div>
                        <div className="lead-qualifiers">
                          {lead.website ? <span className="meta-inline"><Globe size={12} /> Has website</span> : null}
                          <span className="meta-inline"><Map size={12} /> {distanceLabel(lead)}</span>
                          {leadHasMobile(lead) ? <span className="meta-inline"><Phone size={12} /> Mobile 06/07</span> : null}
                        </div>
                      </div>

                      <div className="lead-col lead-col-actions">
                        <div className="lead-priority-block">
                          <span className="lead-phone-label">{leadHasMobile(lead) ? "HIGH PRIORITY" : "PHONE"}</span>
                          {primaryPhone ? (
                            <button className="lead-phone" onClick={(e) => { e.stopPropagation(); copyPhone(primaryPhone); }}>
                              <Phone size={16} /> {primaryPhone.normalizedNational || primaryPhone.original}
                            </button>
                          ) : (
                            <span className="sub">No phone</span>
                          )}
                          <span className="lead-phone-priority">Priority {leadHas06(lead) ? "06" : leadHas07(lead) ? "07" : "standard"}</span>
                        </div>
                        <div className="lead-actions">
                          <button className="bookmark-btn" onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); }} aria-label="Favorite">
                            <Bookmark size={15} />
                          </button>
                          <button className="view-btn" onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); }}>
                            <Eye size={15} /> View details
                          </button>
                        </div>
                        <div className="lead-links">
                          {lead.maps ? <a href={lead.maps} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><MapPin size={15} /> Google</a> : null}
                          {lead.website ? <a href={lead.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><Globe size={15} /> Website</a> : null}
                          {primaryPhone ? <button onClick={(e) => { e.stopPropagation(); openProspect(lead); }}><Target size={15} /> Prospect</button> : null}
                          {primaryPhone?.normalizedE164 && leadHasMobile(lead) ? <button onClick={async (e) => { e.stopPropagation(); setSelectedLead(lead); setSmsLead(lead); const nextMessage = buildSmsMessage(lead); setSmsMessage(nextMessage); updateLeadStatus(lead, "contacted"); await openSmsComposer(lead, nextMessage); }}><MessageSquare size={15} /> SMS</button> : null}
                          {primaryPhone?.normalizedE164 ? <a href={`tel:${primaryPhone.normalizedE164}`} onClick={(e) => { e.stopPropagation(); updateLeadStatus(lead, "contacted"); }}><Phone size={15} /> Call</a> : null}
                        </div>
                      </div>
                    </div>
                  </article>
                </Reveal>
              );
            })}
            </div>
          </div>

          <aside className="drawer lead-drawer">
            {selectedLead ? (
              <>
                <div className="drawer-head">
                  <div>
                    <span className="eyebrow">Lead detail</span>
                    <h2>{selectedLead.name}</h2>
                  </div>
                  <button className="ghost-link small" onClick={() => setSelectedLead(null)}>Close</button>
                </div>
                <div className="drawer-grid">
                  <div><strong>Category</strong><span>{selectedLead.primaryType || "—"}</span></div>
                  <div><strong>Address</strong><span>{selectedLead.address || "—"}</span></div>
                  <div><strong>Google rating</strong><span>{selectedLead.rating ?? "—"}</span></div>
                  <div><strong>Review count</strong><span>{selectedLead.userRatingCount ?? "—"}</span></div>
                  <div><strong>Website</strong><span>{selectedLead.website ? "Available" : "No website"}</span></div>
                  <div><strong>Google Maps</strong><span>{selectedLead.maps ? "Available" : "—"}</span></div>
                </div>
                <div className="drawer-section">
                  <strong>Contacts</strong>
                  <div className="contact-list">
                    {currentPhones.length ? currentPhones.map((phone) => (
                      <button key={`${phone.normalizedE164 || phone.original}-${phone.source}`} className="contact-item" onClick={() => copyPhone(phone)}>
                        <div>
                          <span>{phone.normalizedNational || phone.original}</span>
                          <small>{phoneLabel(phone)} · {phone.source.toUpperCase()} · {phone.prefix || "—"}</small>
                        </div>
                        <Copy size={14} />
                      </button>
                    )) : <div className="empty-inline">No contacts found.</div>}
                  </div>
                </div>
                <div className="drawer-section">
                  <strong>Sources</strong>
                  <div className="source-list">
                    {selectedLead.phones.map((phone, index) => (
                      <div key={`${phone.source}-${index}`} className="source-row">
                        <span>{phone.source.toUpperCase()}</span>
                        <span>{phone.sourceUrl || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="drawer-section prospect-hint">
                  <strong>Prospect</strong>
                  <p>Open the prospect panel to send the lead to your phone with a direct SMS link. QR is desktop only.</p>
                  <button className="button secondary" onClick={() => selectedLead && openProspect(selectedLead)} disabled={!primaryPhoneForLead(selectedLead)}>
                    <Sparkles size={14} /> Open prospect
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-drawer">
                <strong>Find your next clients.</strong>
                <p>Search a niche and location to get started.</p>
              </div>
            )}
          </aside>
        </section>

        <section className="mobile-results">
          {loading ? (
            <div className="mobile-results-state">A procurar negócios...</div>
          ) : null}
          {!loading && filtered.length === 0 ? (
            <div className="mobile-results-state">
              <strong>Nenhum negócio encontrado.</strong>
              <span>Tenta outra localização ou uma categoria mais ampla.</span>
            </div>
          ) : null}
          {filtered.map((lead, index) => {
            const primaryPhone = [...lead.phones].sort((a, b) => phonePriority(a) - phonePriority(b))[0];
            const normalizedPhone = primaryPhone?.normalizedE164 ? normalizeFrenchPhoneForSearch(primaryPhone.normalizedE164) : "";
            const isContacted = Boolean(normalizedPhone && contactedPhoneSet.has(normalizedPhone));
            return (
              <article key={`${lead.placeId || lead.name}-mobile`} className={`${selectedLead?.placeId === lead.placeId ? "mobile-card active" : "mobile-card"} ${leadStatusClass(leadStatusMap[leadKey(lead)] || "new")} ${isContacted ? "contacted" : ""}`} onClick={() => setSelectedLead(lead)}>
                <div className="mobile-card-top">
                  <div className="mobile-card-photo" aria-hidden="true">
                    {leadPhotoUrl(lead) ? <img src={leadPhotoUrl(lead) || undefined} alt="" loading="lazy" /> : <span>{lead.name.slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <div className="mobile-card-identity">
                    <span className="mobile-card-rank">{index + 1}</span>
                    <div className="mobile-card-copy">
                      <h3>{lead.name}</h3>
                    <p className="mobile-card-type">{lead.primaryType || "Local business"}</p>
                    <p>{lead.address}</p>
                    <p className="mobile-card-distance"><MapPin size={13} /> {distanceLabel(lead)} from search</p>
                    </div>
                  </div>
                  <div className={`mobile-priority ${leadHasMobile(lead) ? "high" : "standard"}`}>
                    <span>{isContacted ? "CONTACTED" : leadHasMobile(lead) ? "HIGH" : "STANDARD"}</span>
                    {leadHasMobile(lead) ? <small>06/07</small> : <small>Opportunity</small>}
                  </div>
                </div>
                <div className="badge-row">
                  <span className="badge-chip">{lead.rating ?? "—"} ★</span>
                  <span className="badge-chip">{lead.userRatingCount ?? 0} reviews</span>
                  <span className="badge-chip">{lead.website ? "WEBSITE" : "NO WEBSITE"}</span>
                  <span className="badge-chip">{lead.businessStatus?.toLowerCase().includes("oper") ? "OPEN" : "STATUS UNKNOWN"}</span>
                </div>
                <div className="mobile-contact">
                  {primaryPhone ? <span className="phone-main small"><Phone size={13} /> {primaryPhone.normalizedNational || primaryPhone.original}</span> : <span className="sub">No phone</span>}
                  {primaryPhone?.normalizedE164 && leadHasMobile(lead) ? (
                    <button
                      className="button sms-quick"
                      onClick={async (e) => {
                        e.stopPropagation();
                        setSelectedLead(lead);
                        setSmsLead(lead);
                        const nextMessage = buildSmsMessage(lead);
                        setSmsMessage(nextMessage);
                        updateLeadStatus(lead, "contacted");
                        await openSmsComposer(lead, nextMessage);
                      }}
                    >
                      SMS
                    </button>
                  ) : primaryPhone ? (
                    <button className="ghost-link small" onClick={(e) => { e.stopPropagation(); openProspect(lead); }}><Sparkles size={13} /> Prospect</button>
                  ) : null}
                  <button className="ghost-link small" onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); }}>View details</button>
                </div>
                <div className="mobile-card-links">
                  {lead.maps ? <a href={lead.maps} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><MapPin size={13} /> Google Maps</a> : null}
                  {lead.website ? <a href={lead.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><Globe size={13} /> Website</a> : null}
                  <button onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); }}><Eye size={13} /> Details</button>
                </div>
              </article>
            );
          })}
        </section>

        <section className="bottom-actions">
          <button className="button secondary" onClick={exportCsv} disabled={!filtered.length}>Export CSV</button>
          <a className="button" href="/outreach">Open outreach <ArrowRight size={16} /></a>
        </section>

        {smsLead ? (
        <section className={isDesktop ? "prospect-panel" : "prospect-panel mobile"}>
            <div className="drawer-head">
              <div>
                <span className="eyebrow">Prospect</span>
                <h2>{smsLead.name}</h2>
              </div>
              <button className="ghost-link small" onClick={closeProspect}><X size={14} /> Close</button>
            </div>
            <div className="prospect-grid">
              <div className="prospect-summary">
                <div><strong>Phone</strong><span>{primaryPhoneForLead(smsLead)?.normalizedNational || primaryPhoneForLead(smsLead)?.original || "—"}</span></div>
                <div><strong>Mode</strong><span>{isDesktop ? "Desktop QR" : "Mobile SMS"}</span></div>
                <div><strong>Status</strong><span>{statusLabel(leadStatusMap[leadKey(smsLead)] || "new")}</span></div>
                <div><strong>Outreach</strong><span>{outreachStatusLabel(outreachForLead(smsLead)?.status)}</span></div>
                <div><strong>Last contact</strong><span>{lastContactLabel(outreachForLead(smsLead))}</span></div>
              </div>
              <div className="prospect-message">
                <label htmlFor="sms-message">Message</label>
                <div className="message-variants" aria-label="Variantes de mensagem">
                  <div className="message-variants-head">
                    <strong>Escolher uma abordagem</strong>
                    <span>{smsVariantId === "custom" ? "Personalizada" : "Clica numa opção para testar"}</span>
                  </div>
                  <div className="message-variant-list">
                    {buildSmsMessageVariants(smsLead).map((variant) => (
                      <button
                        type="button"
                        key={variant.id}
                        className={smsVariantId === variant.id ? "message-variant active" : "message-variant"}
                        onClick={() => selectSmsVariant(variant)}
                      >
                        <span className="message-variant-title">{variant.label}</span>
                        <span className="message-variant-objective">{variant.objective}</span>
                        <span className="message-variant-preview">{variant.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  id="sms-message"
                  className="textarea prospect-textarea"
                  value={smsMessage}
                  onChange={(event) => {
                    setSmsVariantId("custom");
                    setSmsMessage(event.target.value);
                  }}
                />
                <div className="char-count">{smsMessage.length} characters</div>
                <div className="prospect-actions">
                  <button className="button secondary" onClick={copyMessage}>{messageCopied ? "Copied ✓" : "Copy message"}</button>
                  <button className="button secondary" onClick={() => smsLead && changeOutreachStatus(smsLead, "replied")}>Marcar como Respondeu</button>
                  <button className="button secondary" onClick={() => smsLead && changeOutreachStatus(smsLead, "interested")}>Interessado</button>
                  <button className="button secondary" onClick={() => smsLead && changeOutreachStatus(smsLead, "client")}>Cliente</button>
                  <button className="button secondary" onClick={() => smsLead && changeOutreachStatus(smsLead, "not_interested")}>Sem interesse</button>
                  {primaryPhoneForLead(smsLead) ? (
                    <button
                      className="button"
                      onClick={() => {
                        const phone = primaryPhoneForLead(smsLead);
                        if (!phone?.normalizedE164) return;
                        updateLeadStatus(smsLead, "contacted");
                        if (isDesktop) {
                          markContactedBySms(smsLead, smsMessage);
                          window.open(buildSmsHref(phone.normalizedE164, smsMessage), "_blank", "noopener,noreferrer");
                          return;
                        }
                        void openSmsComposer(smsLead, smsMessage);
                      }}
                    >
                      {isDesktop ? "Open on phone / QR" : "SMS"}
                    </button>
                  ) : null}
                  {primaryPhoneForLead(smsLead)?.normalizedE164 ? (
                    <a
                      className="button secondary"
                      href={`tel:${primaryPhoneForLead(smsLead)?.normalizedE164}`}
                      onClick={() => updateLeadStatus(smsLead, "contacted")}
                    >
                      <Phone size={14} /> Call
                    </a>
                  ) : null}
                  <button className="button secondary" onClick={() => smsLead && copyNumber(smsLead)}>{numberCopied ? "Copied ✓" : "Copy number"}</button>
                  <button className="button secondary" onClick={() => { updateLeadStatus(smsLead, "contacted"); goToNextProspect(); }}>Next prospect</button>
                </div>
              </div>
              {isDesktop ? (
                <div className="prospect-qr">
                  <strong>Send this prospect to your phone</strong>
                  <p>Scan this QR with your phone to open Messages with the number and message prepared.</p>
                  {primaryPhoneForLead(smsLead)?.normalizedE164 ? (
                    <SmsQr
                      value={buildSmsHref(primaryPhoneForLead(smsLead)!.normalizedE164!, smsMessage)}
                      label={`SMS QR for ${smsLead.name}`}
                    />
                  ) : (
                    <div className="qr-fallback">No valid SMS number.</div>
                  )}
                </div>
              ) : (
                <div className="prospect-qr mobile-only">
                  <strong>Open SMS</strong>
                  <p>Tap the button to open Messages with the recipient and message filled in.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}
