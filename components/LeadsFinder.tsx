"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Mail,
  MapPin,
  Search,
  Send,
  ShieldCheck,
} from "lucide-react";
import type { Lead } from "@/lib/types";

function saveSelected(leads: Lead[]) {
  localStorage.setItem("selected-leads", JSON.stringify(leads));
}

function scoreClass(value: number, good = 80) {
  if (value >= good) return "good";
  if (value >= 50) return "warn";
  return "bad";
}

function auditLabel(category: string) {
  if (category === "performance") return "Performance";
  if (category === "seo") return "SEO";
  if (category === "accessibility") return "Acessibilidade";
  if (category === "best-practices") return "Boas práticas";
  return "Técnico";
}

export default function LeadsFinder() {
  const [query, setQuery] = useState("coiffeur Paris 13");
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function findLeads() {
    const clean = query.trim();
    if (clean.length < 3 || loading) return;

    setLoading(true);
    setError("");
    setLeads([]);
    setExpanded(null);

    try {
      const response = await fetch("/api/find-sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: clean, detectEmails: true, includeAnalysis: false }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao procurar leads");
      setLeads(data.leads || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  function toggleLead(lead: Lead) {
    if (!lead.email) return;
    setSelected((current) => {
      const exists = current.some((x) => x.email === lead.email);
      const next = exists ? current.filter((x) => x.email !== lead.email) : [...current, lead];
      saveSelected(next);
      return next;
    });
  }

  function selectAllWithEmail() {
    const withEmail = leads.filter((lead) => lead.email).slice(0, 20);
    setSelected(withEmail);
    saveSelected(withEmail);
  }

  function exportCsv() {
    const header = [
      "Business", "Email", "Website", "Address", "Performance", "SEO", "Accessibility",
      "BestPractices", "WeakScore", "AuditStatus", "Problems",
    ];
    const rows = leads.map((lead) => [
      lead.name,
      lead.email || "",
      lead.website,
      lead.address,
      lead.auditAvailable === false ? "N/A" : lead.performance,
      lead.auditAvailable === false ? "N/A" : lead.seo,
      lead.auditAvailable === false ? "N/A" : lead.accessibility,
      lead.auditAvailable === false ? "N/A" : lead.bestPractices,
      lead.weakScore,
      lead.auditAvailable === false ? "unavailable" : "ok",
      [...lead.reasons, ...(lead.auditDetails || []).map((item) => `${item.label}${item.value ? `: ${item.value}` : ""}`)].join(" | "),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "weak-site-leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const stats = useMemo(() => ({
    total: leads.length,
    emails: leads.filter((lead) => lead.email).length,
    priority: leads.filter((lead) => lead.weakScore >= 55).length,
    audited: leads.filter((lead) => lead.website && lead.auditAvailable !== false).length,
  }), [leads]);

  return (
    <main className="leadsPage">
      <section className="leadsHero">
        <div className="leadsIntro">
          <span className="eyebrow">Lead finder · auditoria mobile</span>
          <h1>Encontra negócios que precisam de um site melhor.</h1>
          <p>
            Pesquisa negócios locais, encontra contactos e transforma o PageSpeed em problemas concretos que podes explicar ao cliente.
          </p>

          <div className="leadSearch">
            <Search size={19} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && findLeads()}
              placeholder="Ex: coiffeur Paris 13"
              aria-label="Pesquisa de negócios"
            />
            <button onClick={findLeads} disabled={loading || query.trim().length < 3}>
              {loading ? "A analisar…" : "Procurar"}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>

        <div className="leadStats" aria-label="Resumo da pesquisa">
          <div><strong>{stats.total}</strong><span>encontrados</span></div>
          <div><strong>{stats.priority}</strong><span>prioridade alta</span></div>
          <div><strong>{stats.emails}</strong><span>com email</span></div>
          <div><strong>{stats.audited}</strong><span>auditados</span></div>
        </div>
      </section>

      <section className="leadsSection">
        <div className="leadsToolbar">
          <div>
            <h2>Resultados</h2>
            <p>Os sites mais fracos aparecem primeiro. Abre “Detalhes” para veres argumentos concretos para a chamada.</p>
          </div>
          <div className="leadActions">
            <button className="button secondary" onClick={selectAllWithEmail} disabled={!leads.some((lead) => lead.email)}>
              <ShieldCheck size={16} /> Selecionar emails
            </button>
            <button className="button secondary" onClick={exportCsv} disabled={!leads.length}>
              <Download size={16} /> CSV
            </button>
            <a className="button" href="/outreach">
              <Send size={16} /> Outreach <ArrowRight size={16} />
            </a>
          </div>
        </div>

        {loading ? (
          <div className="leadEmpty">
            <span className="leadLoader" />
            <strong>A procurar e auditar sites…</strong>
            <p>Google Maps, PageSpeed e email público.</p>
          </div>
        ) : leads.length === 0 ? (
          <div className="leadEmpty">
            <Search size={24} />
            <strong>Ainda sem resultados</strong>
            <p>Pesquisa um tipo de negócio e uma zona.</p>
          </div>
        ) : (
          <div className="leadList">
            {leads.map((lead, index) => {
              const id = `${lead.name}-${lead.website}-${index}`;
              const isExpanded = expanded === id;
              const checked = Boolean(lead.email && selected.some((item) => item.email === lead.email));
              const auditOk = lead.website && lead.auditAvailable !== false;

              return (
                <article className="leadCard" key={id}>
                  <div className="leadTop">
                    <label className="leadCheck" title={lead.email ? "Selecionar" : "Sem email detetado"}>
                      <input type="checkbox" checked={checked} disabled={!lead.email} onChange={() => toggleLead(lead)} />
                    </label>

                    <div className="leadIdentity">
                      <div className="leadTitleRow">
                        <h3>{lead.name}</h3>
                        <span className={`priorityPill ${lead.weakScore >= 55 ? "hot" : ""}`}>
                          {lead.website ? `Prioridade ${lead.weakScore}/100` : "Sem site"}
                        </span>
                      </div>
                      <p><MapPin size={14} /> {lead.address || "Morada não disponível"}</p>
                      <div className="leadLinks">
                        {lead.website ? <a href={lead.website} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Site</a> : <span>Sem website</span>}
                        {lead.maps && <a href={lead.maps} target="_blank" rel="noreferrer"><MapPin size={14} /> Maps</a>}
                        {lead.email ? <span className="emailFound"><Mail size={14} /> {lead.email}</span> : <span>Sem email público</span>}
                      </div>
                    </div>

                    <div className="scoreGrid">
                      {lead.website ? (
                        <>
                          <div><span>Perf.</span><b className={auditOk ? scoreClass(lead.performance) : "mutedScore"}>{auditOk ? lead.performance : "—"}</b></div>
                          <div><span>SEO</span><b className={auditOk ? scoreClass(lead.seo) : "mutedScore"}>{auditOk ? lead.seo : "—"}</b></div>
                          <div><span>Acess.</span><b className={auditOk ? scoreClass(lead.accessibility) : "mutedScore"}>{auditOk ? lead.accessibility : "—"}</b></div>
                          <div><span>Práticas</span><b className={auditOk ? scoreClass(lead.bestPractices) : "mutedScore"}>{auditOk ? lead.bestPractices : "—"}</b></div>
                        </>
                      ) : <div className="noSiteMetric">Oportunidade direta</div>}
                    </div>
                  </div>

                  <div className="leadReasons">
                    {lead.reasons.map((reason) => <span key={reason}>{reason}</span>)}
                    {lead.website && lead.auditAvailable === false && (
                      <span className="auditUnavailable"><AlertTriangle size={13} /> Auditoria não concluída</span>
                    )}
                  </div>

                  <div className="leadCardFooter">
                    <span>{lead.auditDetails?.length || 0} detalhes técnicos encontrados</span>
                    <button onClick={() => setExpanded(isExpanded ? null : id)} disabled={!lead.website}>
                      {isExpanded ? <><ChevronUp size={16} /> Fechar detalhes</> : <><ChevronDown size={16} /> Ver detalhes</>}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="auditPanel">
                      {lead.auditAvailable === false ? (
                        <div className="auditErrorBox">
                          <AlertTriangle size={18} />
                          <div>
                            <strong>Não uses scores desta auditoria com o cliente.</strong>
                            <p>{lead.auditError || "O PageSpeed não conseguiu concluir a análise deste site."}</p>
                          </div>
                        </div>
                      ) : lead.auditDetails?.length ? (
                        <div className="auditGrid">
                          {lead.auditDetails.map((item, detailIndex) => (
                            <div className={`auditItem ${item.severity}`} key={`${item.label}-${detailIndex}`}>
                              <span>{auditLabel(item.category)}</span>
                              <strong>{item.label}</strong>
                              {item.value && <p>{item.value}</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="auditQuiet">A auditoria não encontrou problemas adicionais relevantes nesta seleção.</p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
