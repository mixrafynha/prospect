import type { LeadStatus } from "@/lib/leads/types";

const labels: Record<LeadStatus, string> = {
  not_contacted: "não contactado",
  contacted: "contactado",
  replied: "respondeu",
  interested: "interessado",
  client: "cliente",
};

export default function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const cls = status === "client" || status === "interested" || status === "replied" ? "badge good" : status === "contacted" ? "badge warn" : "badge";
  return <span className={cls}>{labels[status] || status}</span>;
}
