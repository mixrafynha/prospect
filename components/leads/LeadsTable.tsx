"use client";

import { ExternalLink, Instagram, Mail, MapPin, Phone } from "lucide-react";
import type { CrmLead } from "@/lib/leads/types";
import LeadStatusBadge from "./LeadStatusBadge";
import LeadScreenshot from "./LeadScreenshot";

export default function LeadsTable({ leads, onStatus }: { leads: CrmLead[]; onStatus?: (id: string, status: CrmLead["status"]) => void }) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Preview</th><th>Negócio</th><th>Instagram</th><th>Contacto</th><th>Website</th><th>Rating</th><th>Score</th><th>Status</th><th>Problemas</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id}>
              <td><LeadScreenshot src={lead.screenshotUrl} name={lead.name} /></td>
              <td><div className="business">{lead.name}</div><div className="sub"><MapPin size={12}/> {lead.address}</div></td>
              <td>{lead.instagram?.url ? <a className="badge good" href={lead.instagram.url} target="_blank" rel="noreferrer"><Instagram size={13}/>@{lead.instagram.username}</a> : <span className="badge warn">não encontrado</span>}</td>
              <td><div className="leadContact">{lead.phone && <span><Phone size={13}/>{lead.phone}</span>}{lead.email && <span><Mail size={13}/>{lead.email}</span>}</div></td>
              <td>{lead.website ? <a className="badge" href={lead.website} target="_blank" rel="noreferrer">abrir site <ExternalLink size={12}/></a> : <span className="sub">sem site</span>}</td>
              <td>{lead.rating ?? "-"}</td>
              <td><strong>{lead.weakScore}</strong><div className="sub">P:{lead.performance} SEO:{lead.seo}</div></td>
              <td>{onStatus ? <select className="select" value={lead.status} onChange={(e) => onStatus(lead.id, e.target.value as CrmLead["status"])}><option value="not_contacted">não contactado</option><option value="contacted">contactado</option><option value="replied">respondeu</option><option value="interested">interessado</option><option value="client">cliente</option></select> : <LeadStatusBadge status={lead.status} />}</td>
              <td><div className="sub">{(lead.issues || lead.reasons || []).slice(0, 4).join(", ") || "OK"}</div></td>
            </tr>
          ))}
          {leads.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 28 }} className="sub">Ainda sem resultados.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
