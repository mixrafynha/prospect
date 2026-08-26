"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Copy, ExternalLink, Instagram, Send, Tag } from "lucide-react";
import type { CrmLead, LeadStatus } from "@/lib/leads/types";
import { generateLeadMessage } from "@/lib/leads/messageGenerator";
import { getPipelineIndex, loadCrmLeads, registerLeadAction, setPipelineIndex, updateLeadNotes, updateLeadStatus, updateLeadTags } from "@/lib/leads/storage";
import LeadScreenshot from "@/components/leads/LeadScreenshot";
import LeadStatusBadge from "@/components/leads/LeadStatusBadge";

const quickTags = ["instagram", "mobile", "site lento", "sem CTA", "bom potencial", "follow-up"];

function sortPipeline(leads: CrmLead[]) {
  return leads
    .filter((lead) => lead.website && lead.status !== "client")
    .sort((a, b) => Number(Boolean(b.instagram?.url)) - Number(Boolean(a.instagram?.url)) || Number(a.status !== "not_contacted") - Number(b.status !== "not_contacted") || b.weakScore - a.weakScore);
}

export default function PipelineClient() {
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const stored = sortPipeline(loadCrmLeads());
    setLeads(stored);
    const savedIndex = Math.min(getPipelineIndex(), Math.max(stored.length - 1, 0));
    setIndex(savedIndex);
    setNote(stored[savedIndex]?.notes?.join("\n") || "");
  }, []);

  const lead = leads[index];
  const message = useMemo(() => lead ? generateLeadMessage(lead) : "", [lead]);

  function sync(updated: CrmLead[]) {
    const sorted = sortPipeline(updated);
    setLeads(sorted);
    const safeIndex = Math.min(index, Math.max(sorted.length - 1, 0));
    setIndex(safeIndex);
    setPipelineIndex(safeIndex);
  }

  function changeStatus(status: LeadStatus) {
    if (!lead) return;
    sync(updateLeadStatus(lead.id, status));
  }

  function nextLead() {
    const next = leads.length ? (index + 1) % leads.length : 0;
    setIndex(next);
    setPipelineIndex(next);
    setNote(leads[next]?.notes?.join("\n") || "");
    setCopied(false);
  }

  async function copyMessage() {
    if (!lead || !message) return;
    await navigator.clipboard.writeText(message);
    setCopied(true);
    sync(registerLeadAction(lead.id, "copied_message", "Mensagem copiada para Instagram"));
  }

  async function copyOpenAndMark() {
    if (!lead || !message) return;
    await navigator.clipboard.writeText(message);
    setCopied(true);
    const updated = registerLeadAction(lead.id, "copied_message", "Mensagem copiada + Instagram aberto", "contacted");
    sync(updated);
    if (lead.instagram?.url) window.open(lead.instagram.url, "_blank", "noopener,noreferrer");
  }

  function openInstagram() {
    if (!lead?.instagram?.url) return;
    window.open(lead.instagram.url, "_blank", "noopener,noreferrer");
    sync(registerLeadAction(lead.id, "opened_instagram", "Instagram aberto", lead.status === "not_contacted" ? "contacted" : lead.status));
  }

  function saveNote() {
    if (!lead) return;
    sync(updateLeadNotes(lead.id, note.split("\n").map((item) => item.trim()).filter(Boolean)));
  }

  function toggleTag(tag: string) {
    if (!lead) return;
    const has = lead.tags?.includes(tag);
    const tags = has ? lead.tags.filter((item) => item !== tag) : [...(lead.tags || []), tag];
    sync(updateLeadTags(lead.id, tags));
  }

  if (!lead) {
    return (
      <section className="section emptyPipeline">
        <h1>Pipeline vazio.</h1>
        <p className="leadText">Vai a “Pesquisar leads”. Agora a app só guarda negócios com website, porque sem site não vale a pena para vender melhoria de site.</p>
        <a className="button gold" href="/leads">Pesquisar leads</a>
      </section>
    );
  }

  return (
    <section className="section pipelinePage">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Pipeline semi-automático · copia, abre Instagram e cola</p>
          <h1>{lead.name}</h1>
          <p className="footerText">Lead {index + 1} de {leads.length} · score {lead.weakScore} · {lead.address}</p>
        </div>
        <div>
          <LeadStatusBadge status={lead.status} />
          <button className="button gold" onClick={nextLead}>Próximo <ArrowRight size={17}/></button>
        </div>
      </div>

      <div className="pipelineGrid">
        <div className="pipelineVisual">
          <LeadScreenshot src={lead.screenshotUrl} name={lead.name} />
          <div className="pipelineLinks">
            {lead.instagram?.url ? <button className="button gold" onClick={openInstagram}><Instagram size={18}/>Abrir Instagram</button> : <button className="button secondary" disabled><Instagram size={18}/>Sem Instagram</button>}
            {lead.website && <a className="button secondary" href={lead.website} target="_blank" rel="noreferrer">Abrir site <ExternalLink size={16}/></a>}
            {lead.maps && <a className="button secondary" href={lead.maps} target="_blank" rel="noreferrer">Google Maps</a>}
          </div>

          <div className="issueBox">
            <h3>Problemas para usar na DM</h3>
            {(lead.issues || lead.reasons || []).slice(0, 8).map((issue) => <span className="badge warn" key={issue}>{issue}</span>)}
          </div>

          <div className="issueBox">
            <h3>Oportunidades</h3>
            {(lead.opportunities || []).slice(0, 6).map((item) => <span className="badge good" key={item}>{item}</span>)}
            {(!lead.opportunities || lead.opportunities.length === 0) && <p className="sub">Sem oportunidades detalhadas.</p>}
          </div>
        </div>

        <div className="pipelineWork">
          <div className="messageBox">
            <div className="toolbar smallToolbar"><h2>Mensagem pronta para Instagram</h2><button className="button secondary" onClick={copyMessage}><Copy size={16}/>{copied ? "Copiado" : "Copiar"}</button></div>
            <textarea className="textarea" value={message} readOnly />
            <button className="button gold fullButton" onClick={copyOpenAndMark} disabled={!lead.instagram?.url}><Send size={18}/>Copiar mensagem + abrir Instagram</button>
            {copied && <div className="success"><CheckCircle2 size={18}/>Mensagem copiada. Agora só cola no Instagram.</div>}
          </div>

          <div className="statusActions">
            <button className="button secondary" onClick={() => changeStatus("contacted")}>Contactado</button>
            <button className="button secondary" onClick={() => changeStatus("replied")}>Respondeu</button>
            <button className="button gold" onClick={() => changeStatus("interested")}>Interessado</button>
            <button className="button" onClick={() => changeStatus("client")}>Cliente</button>
          </div>

          <div className="notesBox">
            <h3>Notas</h3>
            <textarea className="textarea notesArea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: respondeu no Instagram, quer preço, enviar demo..." />
            <button className="button secondary" onClick={saveNote}>Guardar notas</button>
          </div>

          <div className="tagsBox">
            <h3><Tag size={16}/> Tags rápidas</h3>
            <div className="chips">{quickTags.map((tag) => <button key={tag} className={lead.tags?.includes(tag) ? "badge good" : "badge"} onClick={() => toggleTag(tag)}>{tag}</button>)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
