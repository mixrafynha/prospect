"use client";

import { ArrowRight, Check, Copy, ExternalLink, Globe, Mail, MapPin, Search, Phone, PanelRightOpen, Sparkles, Star, Layers3, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import Reveal from "@/components/Reveal";
import type { Lead, PhoneNumberData } from "@/lib/types";
import { buildSmsHref, buildSmsLink, buildSmsMessage } from "@/lib/smsTemplate";
import SmsQr from "@/components/SmsQr";

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

export default function LeadsWorkspace() {
  const [query, setQuery] = useState("Institut de beauté");
  const [location, setLocation] = useState("Rennes");
  const [radius, setRadius] = useState(5000);
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
  const [messageCopied, setMessageCopied] = useState(false);
  const [numberCopied, setNumberCopied] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

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
    setLeads([]);
    setSelectedLead(null);

    try {
      setTimeout(() => setStep("Finding contact information..."), 900);
      setTimeout(() => setStep("Analyzing websites..."), 1700);
      setTimeout(() => setStep("Preparing results..."), 2400);

      const response = await fetch("/api/find-sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, locationText: location, radius, detectEmails: true }),
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
    setSmsMessage(buildSmsMessage(lead));
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

  async function openSmsComposer(lead: Lead, options?: { preferFallback?: boolean }) {
    const phone = primaryPhoneForLead(lead);
    if (!phone?.normalizedE164) return false;

    const smsWithBody = buildSmsLink(phone.normalizedE164, smsMessage, { includeBody: true });
    const smsWithoutBody = buildSmsLink(phone.normalizedE164, smsMessage, { includeBody: false });

    try {
      if (options?.preferFallback) {
        await navigator.clipboard.writeText(smsMessage);
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
    setSmsMessage(buildSmsMessage(nextLead));
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
        <section className="workspace-hero">
          <Reveal>
            <span className="eyebrow">Find leads</span>
            <h1>Search businesses by niche and location.</h1>
            <p className="leadText">Find direct contacts, prioritize 06/07 and inspect every opportunity without losing businesses that have no website.</p>
          </Reveal>

          <Reveal delay={120}>
            <div className="search-panel">
              <div className="search-field">
                <label>Business</label>
                <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Institut de beauté" onKeyDown={(e) => e.key === "Enter" && searchLeads()} />
              </div>
              <div className="search-field">
                <label>Location</label>
                <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Rennes, 75013, Lyon 3" onKeyDown={(e) => e.key === "Enter" && searchLeads()} />
              </div>
              <div className="search-field">
                <label>Radius</label>
                <select className="input" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
                  <option value={2000}>2 km</option>
                  <option value={5000}>5 km</option>
                  <option value={10000}>10 km</option>
                  <option value={20000}>20 km</option>
                  <option value={50000}>50 km</option>
                </select>
              </div>
              <button className="button gold" onClick={searchLeads} disabled={loading}>
                <Search size={16} /> {loading ? "Searching..." : "Search"}
              </button>
            </div>
          </Reveal>

          <Reveal delay={180}>
            <div className="progress-strip">
              <span>{step}</span>
              <strong>{stats.total} results{activeSearchLocation ? ` · ${activeSearchLocation.label} · ${Math.round(activeSearchLocation.radiusMeters / 1000)} km` : ""}</strong>
            </div>
            {activeSearchLocation ? (
              <div className="progress-strip" style={{ marginTop: 10 }}>
                <span>Localização ativa</span>
                <strong>
                  {activeSearchLocation.label} · Lat: {activeSearchLocation.latitude ?? "—"} · Lng: {activeSearchLocation.longitude ?? "—"} · Raio: {Math.round(activeSearchLocation.radiusMeters / 1000)} km
                </strong>
              </div>
            ) : null}
          </Reveal>
        </section>

        <section className="filters-row">
          <button className={phoneFilter === "all" ? "chip active" : "chip"} onClick={() => setPhoneFilter("all")}>All</button>
          <button className={phoneFilter === "06" ? "chip active" : "chip"} onClick={() => setPhoneFilter("06")}>06</button>
          <button className={phoneFilter === "07" ? "chip active" : "chip"} onClick={() => setPhoneFilter("07")}>07</button>
          <button className={phoneFilter === "06-07" ? "chip active" : "chip"} onClick={() => setPhoneFilter("06-07")}>06 + 07</button>
          <select className="chip select-chip" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="all">All status</option>
            <option value="new">New</option>
            <option value="viewed">Viewed</option>
            <option value="contacted">Contacted</option>
          </select>
          <button className={phoneFilter === "no-mobile" ? "chip active" : "chip"} onClick={() => setPhoneFilter("no-mobile")}>Sans mobile</button>
          <button className={phoneFilter === "no-website" ? "chip active" : "chip"} onClick={() => setPhoneFilter("no-website")}>No website</button>
          <button className={phoneFilter === "has-website" ? "chip active" : "chip"} onClick={() => setPhoneFilter("has-website")}>Has website</button>
          <div className="spacer" />
          <button className={sortMode === "opportunity" ? "chip active" : "chip"} onClick={() => setSortMode("opportunity")}>Best opportunities</button>
          <button className={sortMode === "mobiles" ? "chip active" : "chip"} onClick={() => setSortMode("mobiles")}>06/07 first</button>
          <button className={sortMode === "reviews" ? "chip active" : "chip"} onClick={() => setSortMode("reviews")}>Most reviews</button>
          <button className={sortMode === "rating" ? "chip active" : "chip"} onClick={() => setSortMode("rating")}>Highest rating</button>
        </section>

        <section className="stats-bar">
          <div><strong>{stats.total}</strong><span>results</span></div>
          <div><strong>{stats.mobile}</strong><span>with mobile</span></div>
          <div><strong>{stats.noWebsite}</strong><span>no website</span></div>
          <div><strong>{copied ? "Copied" : "Copy"}</strong><span>{copied || "phone ready"}</span></div>
        </section>

        <section className="results-layout">
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
              return (
                <Reveal key={`${lead.placeId || lead.name}-${index}`} delay={Math.min(index * 40, 180)}>
                  <article className={`${selectedLead?.placeId === lead.placeId ? "lead-card active" : "lead-card"} ${leadStatusClass(status)}`} onClick={() => setSelectedLead(lead)}>
                    <div className="lead-card-main">
                      <div className="lead-title-row">
                        <div>
                          <h3>{lead.name}</h3>
                          <p>{lead.address}</p>
                        </div>
                        <div className="opportunity-badge">{lead.hasMobilePhone ? "HIGH" : lead.website ? "MEDIUM" : "LOW"}</div>
                      </div>

                      <div className="badge-row">
                        <span className="badge-chip">{lead.hasMobilePhone ? "MOBILE" : "NO MOBILE"}</span>
                        {leadHas06(lead) ? <span className="badge-chip">06</span> : null}
                        {leadHas07(lead) ? <span className="badge-chip">07</span> : null}
                        <span className="badge-chip">{lead.website ? "WEBSITE" : "NO WEBSITE"}</span>
                        <span className="badge-chip">{lead.businessStatus || "UNKNOWN"}</span>
                      </div>

                      <div className="lead-metrics">
                        <div><Star size={14} /> {lead.rating ?? "—"}</div>
                        <div><Layers3 size={14} /> {lead.userRatingCount ?? 0} reviews</div>
                        <div><MapPin size={14} /> {lead.primaryType || "local business"}</div>
                      </div>

                      <div className="contact-line">
                        {primaryPhone ? (
                          <button className="phone-main" onClick={(e) => { e.stopPropagation(); copyPhone(primaryPhone); }}>
                            <Phone size={14} /> {primaryPhone.normalizedNational || primaryPhone.original} <span>{phoneLabel(primaryPhone)}</span>
                          </button>
                        ) : (
                          <span className="sub">No phone</span>
                        )}
                        {lead.email ? <span className="badge-chip"><Mail size={13} /> {lead.email}</span> : null}
                      </div>
                    </div>

                    <div className="lead-actions">
                      {lead.website ? (
                        <a href={lead.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><Globe size={14} /> Website</a>
                      ) : <span className="sub">No website</span>}
                      {lead.maps ? (
                        <a href={lead.maps} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><ExternalLink size={14} /> Google</a>
                      ) : null}
                      {primaryPhone ? (
                        <button className="ghost-link small" onClick={(e) => { e.stopPropagation(); openProspect(lead); }}>
                          <Sparkles size={14} /> Prospect
                        </button>
                      ) : null}
                      {primaryPhone?.normalizedE164 && leadHasMobile(lead) ? (
                        <button
                          className="button sms-quick"
                          onClick={async (e) => {
                            e.stopPropagation();
                            setSelectedLead(lead);
                            setSmsLead(lead);
                            setSmsMessage(buildSmsMessage(lead));
                            updateLeadStatus(lead, "contacted");
                            await openSmsComposer(lead);
                          }}
                        >
                          SMS
                        </button>
                      ) : null}
                      {primaryPhone?.normalizedE164 ? (
                        <a
                          className="ghost-link small"
                          href={`tel:${primaryPhone.normalizedE164}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateLeadStatus(lead, "contacted");
                          }}
                        >
                          <Phone size={14} /> Call
                        </a>
                      ) : null}
                      <button className="ghost-link small" onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); }}>
                        <PanelRightOpen size={14} /> View details
                      </button>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>

          <aside className="drawer">
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
          {filtered.map((lead) => {
            const primaryPhone = [...lead.phones].sort((a, b) => phonePriority(a) - phonePriority(b))[0];
            return (
              <article key={`${lead.placeId || lead.name}-mobile`} className={`${selectedLead?.placeId === lead.placeId ? "mobile-card active" : "mobile-card"} ${leadStatusClass(leadStatusMap[leadKey(lead)] || "new")}`} onClick={() => setSelectedLead(lead)}>
                <div className="mobile-card-top">
                  <div>
                    <h3>{lead.name}</h3>
                    <p>{lead.address}</p>
                  </div>
                  <div className="opportunity-badge">{lead.hasMobilePhone ? "HIGH" : "MEDIUM"}</div>
                </div>
                <div className="badge-row">
                  <span className="badge-chip">{lead.rating ?? "—"} ★</span>
                  <span className="badge-chip">{lead.userRatingCount ?? 0} reviews</span>
                  <span className="badge-chip">{lead.website ? "WEBSITE" : "NO WEBSITE"}</span>
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
                        setSmsMessage(buildSmsMessage(lead));
                        updateLeadStatus(lead, "contacted");
                        await openSmsComposer(lead);
                      }}
                    >
                      SMS
                    </button>
                  ) : primaryPhone ? (
                    <button className="ghost-link small" onClick={(e) => { e.stopPropagation(); openProspect(lead); }}><Sparkles size={13} /> Prospect</button>
                  ) : null}
                  <button className="ghost-link small" onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); }}>View details</button>
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
              </div>
              <div className="prospect-message">
                <label htmlFor="sms-message">Message</label>
                <textarea
                  id="sms-message"
                  className="textarea prospect-textarea"
                  value={smsMessage}
                  onChange={(event) => setSmsMessage(event.target.value)}
                />
                <div className="char-count">{smsMessage.length} characters</div>
                <div className="prospect-actions">
                  <button className="button secondary" onClick={copyMessage}>{messageCopied ? "Copied ✓" : "Copy message"}</button>
                  {primaryPhoneForLead(smsLead) ? (
                    <button
                      className="button"
                      onClick={() => {
                        const phone = primaryPhoneForLead(smsLead);
                        if (!phone?.normalizedE164) return;
                        updateLeadStatus(smsLead, "contacted");
                        if (isDesktop) {
                          window.open(buildSmsHref(phone.normalizedE164, smsMessage), "_blank", "noopener,noreferrer");
                          return;
                        }
                        void openSmsComposer(smsLead);
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
