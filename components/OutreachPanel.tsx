"use client";

import { useEffect, useMemo, useState } from "react";
import { MailCheck, Send, Trash2 } from "lucide-react";
import type { Lead } from "@/lib/types";

const DEFAULT_MESSAGE = "Je peux vous préparer gratuitement 2 ou 3 idées concrètes pour améliorer votre site, surtout sur mobile, vitesse, design et demandes de contact.";

export default function OutreachPanel() {
  const [recipients, setRecipients] = useState<Lead[]>([]);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      setRecipients(JSON.parse(localStorage.getItem("selected-leads") || "[]"));
    } catch {
      setRecipients([]);
    }
  }, []);

  const validRecipients = useMemo(() => recipients.filter((r) => r.email).slice(0, 20), [recipients]);

  function remove(email: string | null) {
    if (!email) return;
    const next = recipients.filter((r) => r.email !== email);
    setRecipients(next);
    localStorage.setItem("selected-leads", JSON.stringify(next));
  }

  function clearAll() {
    setRecipients([]);
    localStorage.removeItem("selected-leads");
  }

  async function sendBulk() {
    setSending(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/send-bulk-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: validRecipients, message }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao enviar emails");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <main className="outreach-page">
        <section className="outreach-hero">
          <div className="hero-bg" />
          <p className="eyebrow">Bulk outreach seguro</p>
          <h1>Envia um email bonito para vários leads.</h1>
          <p className="leadText">Aqui aparecem os leads selecionados em `/leads`. Revê a mensagem, confirma os destinatários e envia até 20 emails por lote.</p>
        </section>

        <section className="outreach-grid">
          <div className="outreach-card">
          <div className="toolbar">
            <div>
              <h2 style={{ margin: 0 }}>Destinatários</h2>
              <p className="footerText">{validRecipients.length} email(s) pronto(s) para envio.</p>
            </div>
            <button className="button secondary" onClick={clearAll} disabled={!recipients.length}><Trash2 size={16}/>Limpar</button>
          </div>
          <div className="recipientList">
            {validRecipients.map((r) => (
              <div className="recipient" key={r.email || r.website}>
                <div>
                  <strong>{r.name}</strong>
                  <div className="sub">{r.email}</div>
                  <div className="sub">Score: {r.weakScore} · Perf: {r.performance}/100 · SEO: {r.seo}/100</div>
                </div>
                <button className="button secondary" onClick={() => remove(r.email)} style={{ padding: "10px 12px" }}>remover</button>
              </div>
            ))}
            {validRecipients.length === 0 && <div className="notice">Vai a `/leads`, pesquisa negócios e seleciona contactos com email.</div>}
          </div>
          </div>

          <div className="outreach-card">
          <h2 style={{ marginTop: 0 }}>Mensagem</h2>
          <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} />
          <p className="footerText">O email HTML inclui automaticamente nome do negócio, website, métricas PageSpeed e botão para responder.</p>
          {error && <p className="error">{error}</p>}
          {result && <p className="notice"><MailCheck size={16}/> Enviados: {result.sent} · Falhados: {result.failed}</p>}
          <button className="button gold" onClick={sendBulk} disabled={sending || validRecipients.length === 0} style={{ width: "100%", marginTop: 14 }}>
            <Send size={18}/>{sending ? "A enviar..." : `Enviar para ${validRecipients.length} contacto(s)`}
          </button>
          </div>
        </section>
      </main>
    </>
  );
}
