"use client";

import { useEffect, useMemo, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { getFrenchPhoneVariants, loadOutreachHistory, normalizeFrenchPhoneForSearch, updateOutreachStatus, type OutreachHistoryItem, type OutreachStatus } from "@/lib/leads/outreachHistory";

const statusOptions: Array<{ value: OutreachStatus; label: string }> = [
  { value: "new", label: "Novo" },
  { value: "contacted", label: "Contactado" },
  { value: "replied", label: "Respondeu" },
  { value: "interested", label: "Interessado" },
  { value: "client", label: "Cliente" },
  { value: "not_interested", label: "Sem interesse" },
];

function statusLabel(status: OutreachStatus) {
  return statusOptions.find((item) => item.value === status)?.label || status;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

export default function ContactsClient() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | OutreachStatus>("all");
  const [items, setItems] = useState<OutreachHistoryItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setItems(loadOutreachHistory());
    setMounted(true);
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeFrenchPhoneForSearch(query);
    const variants = getFrenchPhoneVariants(query);
    return items.filter((item) => {
      if (status !== "all" && item.status !== status) return false;
      if (!query.trim()) return true;
      const haystack = [
        item.companyName,
        item.website,
        item.location,
        item.phone,
        item.normalizedPhone,
        item.preparedMessage,
        item.leadId,
      ].join(" ").toLowerCase();
      const phoneMatch = variants.some((variant) => item.normalizedPhone === variant || item.phone.includes(variant) || item.normalizedPhone.includes(variant));
      return haystack.includes(query.toLowerCase()) || (normalizedQuery && item.normalizedPhone.includes(normalizedQuery)) || phoneMatch;
    });
  }, [items, query, status]);

  const counts = useMemo(() => ({
    contacted: items.filter((item) => item.status === "contacted").length,
    replied: items.filter((item) => item.status === "replied").length,
    interested: items.filter((item) => item.status === "interested").length,
    client: items.filter((item) => item.status === "client").length,
  }), [items]);

  function handleStatusChange(item: OutreachHistoryItem, nextStatus: OutreachStatus) {
    updateOutreachStatus(item.id, nextStatus);
    setItems(loadOutreachHistory());
  }

  return (
    <>
      <SiteHeader />
      <main className="workspace">
        <section className="workspace-hero">
          <span className="eyebrow">Contacts</span>
          <h1>Outreach history</h1>
          <p className="leadText">Pesquisa primeiro pelo telefone. O matching aceita formatos franceses diferentes e encontra a empresa mesmo com espaços, +33 ou 06/07.</p>
          <div className="contact-kpis" suppressHydrationWarning>
            <div><strong>{counts.contacted}</strong><span>Contactados</span></div>
            <div><strong>{counts.replied}</strong><span>Responderam</span></div>
            <div><strong>{counts.interested}</strong><span>Interessados</span></div>
            <div><strong>{counts.client}</strong><span>Clientes</span></div>
          </div>
          <div className="search-panel contact-search">
            <div className="search-field wide">
              <label>Telefone, empresa ou website</label>
              <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="+33 7 80 71 85 51" />
            </div>
            <div className="search-field compact">
              <label>Status</label>
              <select className="input" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
                <option value="all">Todos</option>
                <option value="contacted">Contactados</option>
                <option value="replied">Responderam</option>
                <option value="interested">Interessados</option>
                <option value="client">Clientes</option>
                <option value="not_interested">Sem interesse</option>
              </select>
            </div>
          </div>
        </section>

        <section className="results-section compact">
          <div className="contact-list-shell">
            <div className="toolbar small-toolbar">
              <div>
                <h2>Histórico</h2>
                <p className="muted">{mounted ? `${filtered.length} contactos` : "A carregar histórico..."}</p>
              </div>
            </div>
            <div className="contact-history-list">
              {filtered.map((item) => (
                <article key={item.id} className="contact-history-card">
                  <div className="contact-history-main">
                    <div>
                      <h3>{item.companyName}</h3>
                      <p className="sub">{item.location}</p>
                    </div>
                    <div className="badge-chip">{statusLabel(item.status)}</div>
                  </div>
                  <div className="contact-history-grid">
                    <div><strong>Telefone</strong><span>{item.phone}</span></div>
                    <div><strong>Website</strong><span>{item.website || "—"}</span></div>
                    <div><strong>Contacto</strong><span>{formatDate(item.contactAt)}</span></div>
                    <div><strong>Lead ID</strong><span>{item.leadId}</span></div>
                  </div>
                  <div className="contact-history-message">
                    <strong>Mensagem</strong>
                    <p>{item.preparedMessage}</p>
                  </div>
                  <div className="contact-history-actions">
                    <select className="input" value={item.status} onChange={(event) => handleStatusChange(item, event.target.value as OutreachStatus)}>
                      <option value="new">Novo</option>
                      <option value="contacted">Contactado</option>
                      <option value="replied">Respondeu</option>
                      <option value="interested">Interessado</option>
                      <option value="client">Cliente</option>
                      <option value="not_interested">Sem interesse</option>
                    </select>
                  </div>
                </article>
              ))}
              {filtered.length === 0 && <div className="empty-state">Ainda sem contactos para mostrar.</div>}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
