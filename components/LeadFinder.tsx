"use client";

import { ArrowRight, Download, ExternalLink, Mail, MapPin, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { Lead } from "@/lib/types";
import SiteHeader from "@/components/SiteHeader";

const presets = [
  "coiffeur Rennes",
  "institut de beauté Lyon 3",
  "restaurant Marseille 6",
  "barbier Lille",
  "garage automobile Bordeaux"
];

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function outreachUrl(lead: Lead) {
  const params = new URLSearchParams({
    businessName: lead.name,
    website: lead.website,
    maps: lead.maps,
    performance: String(lead.performance),
    seo: String(lead.seo),
    accessibility: String(lead.accessibility),
    weakScore: String(lead.weakScore),
    reasons: lead.reasons.join(", ")
  });
  return `/outreach?${params.toString()}`;
}

export default function LeadFinder() {
  const [query, setQuery] = useState("coiffeur Rennes");
  const [location, setLocation] = useState("Rennes");
  const [radius, setRadius] = useState(10000);
  const [activeSearchLocation, setActiveSearchLocation] = useState<{ label: string; radiusMeters: number } | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const hotLeads = useMemo(() => leads.filter((lead) => lead.weakScore >= 55).length, [leads]);
  const withoutSite = useMemo(() => leads.filter((lead) => !lead.website).length, [leads]);

  async function runSearch(nextQuery = query) {
    const clean = nextQuery.trim();
    if (!clean) return;

    setQuery(clean);
    setLoading(true);
    setError("");
    setLeads([]);
    setActiveSearchLocation(null);

    try {
      const response = await fetch("/api/find-sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: clean, locationText: location, radius, includeAnalysis: false })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao procurar leads.");
      setLeads(data.leads || []);
      setActiveSearchLocation(data.location?.label ? { label: data.location.label, radiusMeters: data.location.radiusMeters || radius } : { label: location, radiusMeters: radius });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const header = ["Business", "Address", "Website", "Google Maps", "Rating", "Performance", "SEO", "Accessibility", "Best Practices", "Weak Score", "Reasons"];
    const rows = leads.map((lead) => [
      lead.name,
      lead.address,
      lead.website,
      lead.maps,
      lead.rating ?? "",
      lead.performance,
      lead.seo,
      lead.accessibility,
      lead.bestPractices,
      lead.weakScore,
      lead.reasons.join(" | ")
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `weak-sites-${query.replace(/\s+/g, "-").toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <SiteHeader />
      <main className="page">
        <section className="hero" id="search">
          <div className="hero-bg" />
          <div className="container hero-grid">
            <div>
              <span className="eyebrow">Prospecção premium em minutos</span>
              <h1>Encontra sites fracos e prepara o contacto.</h1>
              <p className="lead-text">Pesquisa negócios locais, mede o site no mobile, calcula prioridade e passa direto para a página de outreach.</p>

              <div className="search-card">
                <input
                  className="input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && runSearch()}
                  placeholder="Ex: coiffeur Rennes"
                />
                <button className="btn" onClick={() => runSearch()} disabled={loading}>
                  {loading ? "A analisar..." : <><Search size={18} /> Procurar</>}
                </button>
              </div>
              <div className="search-card" style={{ marginTop: 12 }}>
                <input className="input" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Localização: Rennes, 75013, Lyon 3" />
                <select className="input" value={radius} onChange={(event) => setRadius(Number(event.target.value))}>
                  <option value={2000}>2 km</option>
                  <option value={5000}>5 km</option>
                  <option value={10000}>10 km</option>
                  <option value={20000}>20 km</option>
                  <option value={50000}>50 km</option>
                </select>
              </div>
              {activeSearchLocation ? <p className="muted">Pesquisa ativa: {activeSearchLocation.label} · Rayon: {Math.round(activeSearchLocation.radiusMeters / 1000)} km</p> : null}

              <div className="quick">
                {presets.map((preset) => (
                  <button key={preset} onClick={() => runSearch(preset)} disabled={loading}>{preset}</button>
                ))}
              </div>

              <div className="stats">
                <div className="stat"><strong>{leads.length}</strong><span>leads encontrados</span></div>
                <div className="stat"><strong>{hotLeads}</strong><span>alta prioridade</span></div>
                <div className="stat"><strong>{withoutSite}</strong><span>sem website</span></div>
              </div>

              {error && <div className="error">{error}</div>}
            </div>

            <div className="visual" aria-hidden="true">
              <div className="visual-card">
                <div className="screen">
                  <div className="screen-top" />
                  <div className="screen-hero">
                    <span className="pill">Audit + Outreach</span>
                    <div className="mini-bars"><i /><i /><i /></div>
                  </div>
                  <div className="metrics">
                    <div className="metric"><span>Perf</span><b>32</b></div>
                    <div className="metric"><span>SEO</span><b>58</b></div>
                    <div className="metric"><span>Lead</span><b>86</b></div>
                  </div>
                </div>
              </div>
              <div className="score-float">
                <b>86</b>
                <p>Score alto = bom negócio com site fraco. Contacta primeiro.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="results-section" id="results">
          <div className="container">
            <div className="toolbar">
              <div>
                <h2>Leads encontrados</h2>
                <p className="muted">Ordenado automaticamente do pior site para o melhor.</p>
              </div>
              <div className="actions">
                <button className="ghost" onClick={exportCsv} disabled={!leads.length}><Download size={16} /> Export CSV</button>
              </div>
            </div>

            <div className="panel">
              {loading ? (
                <div className="empty">A procurar negócios e a medir os sites. Pode demorar alguns segundos.</div>
              ) : !leads.length ? (
                <div className="empty">Pesquisa um nicho/local para aparecerem negócios aqui.</div>
              ) : (
                <div className="grid">
                  {leads.map((lead, index) => (
                    <article className="lead-card" key={`${lead.name}-${index}`}>
                      <div>
                        <h3>{lead.name}</h3>
                        <div className="address">{lead.address}</div>
                        <div className="tags">
                          {lead.reasons.length ? lead.reasons.map((reason) => <span className="tag" key={reason}>{reason}</span>) : <span className="tag">Sem problemas graves</span>}
                        </div>
                        <div className="metrics">
                          <div className="metric"><span>Perf</span><b>{lead.performance}</b></div>
                          <div className="metric"><span>SEO</span><b>{lead.seo}</b></div>
                          <div className="metric"><span>Acess.</span><b>{lead.accessibility}</b></div>
                          <div className="metric"><span>Rating</span><b>{lead.rating ?? "—"}</b></div>
                        </div>
                        <div className="links">
                          {lead.website ? <a href={lead.website} target="_blank"><ExternalLink size={14} /> Abrir site</a> : <a>Sem site</a>}
                          {lead.maps && <a href={lead.maps} target="_blank"><MapPin size={14} /> Google Maps</a>}
                          {lead.website && <a className="primary-link" href={outreachUrl(lead)}><Mail size={14} /> Find email <ArrowRight size={14} /></a>}
                        </div>
                      </div>
                      <div className="score"><b>{lead.weakScore}</b><span>Weak Score</span></div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      <footer className="footer">Lead Studio · Next.js · Google Places · PageSpeed · Resend</footer>
    </>
  );
}
