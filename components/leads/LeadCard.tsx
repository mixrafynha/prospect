import type { CrmLead } from "@/lib/leads/types";
import LeadScreenshot from "./LeadScreenshot";
import LeadStatusBadge from "./LeadStatusBadge";

export default function LeadCard({ lead }: { lead: CrmLead }) {
  return (
    <article className="leadCard">
      <LeadScreenshot src={lead.screenshotUrl} name={lead.name} />
      <div>
        <div className="cardTop"><h3>{lead.name}</h3><LeadStatusBadge status={lead.status} /></div>
        <p className="sub">{lead.address}</p>
        <div className="chips">
          <span className="badge bad">Score {lead.weakScore}</span>
          {lead.instagram?.url ? <a className="badge good" href={lead.instagram.url} target="_blank" rel="noreferrer">@{lead.instagram.username}</a> : <span className="badge warn">sem instagram</span>}
          {lead.phone && <span className="badge">{lead.phone}</span>}
        </div>
        <p className="sub">{(lead.issues || lead.reasons || []).slice(0, 3).join(" · ")}</p>
      </div>
    </article>
  );
}
