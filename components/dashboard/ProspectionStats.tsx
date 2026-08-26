"use client";

import type { CrmLead } from "@/lib/leads/types";

export default function ProspectionStats({ leads }: { leads: CrmLead[] }) {
  const total = leads.length;
  const contacted = leads.filter((l) => l.status !== "not_contacted").length;
  const replied = leads.filter((l) => ["replied", "interested", "client"].includes(l.status)).length;
  const interested = leads.filter((l) => ["interested", "client"].includes(l.status)).length;
  const clients = leads.filter((l) => l.status === "client").length;
  const withInstagram = leads.filter((l) => l.instagram?.url).length;
  const avgWeak = total ? Math.round(leads.reduce((sum, l) => sum + (l.weakScore || 0), 0) / total) : 0;
  const responseRate = contacted ? Math.round((replied / contacted) * 100) : 0;
  const conversionRate = contacted ? Math.round((clients / contacted) * 100) : 0;

  const stats = [
    [total, "leads encontrados"],
    [contacted, "contactados"],
    [replied, "respostas"],
    [interested, "interessados"],
    [clients, "clientes"],
    [`${responseRate}%`, "taxa resposta"],
    [`${conversionRate}%`, "taxa conversão"],
    [withInstagram, "com Instagram"],
    [avgWeak, "weak score médio"],
  ];

  return <div className="miniStats">{stats.map(([value, label]) => <div className="miniStat" key={String(label)}><strong>{value}</strong><span>{label}</span></div>)}</div>;
}
