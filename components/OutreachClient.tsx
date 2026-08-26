"use client";

import { CheckCircle2, ExternalLink, Mail, Search, Send, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import SiteHeader from "@/components/SiteHeader";

type FindEmailResponse = {
  website: string;
  emails: string[];
  checkedUrls: string[];
};

function numberParam(value: string | null) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

export default function OutreachClient() {
  const params = useSearchParams();
  const [website, setWebsite] = useState(params.get("website") || "");
  const [businessName, setBusinessName] = useState(params.get("businessName") || "");
  const [emails, setEmails] = useState<string[]>([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [checkedUrls, setCheckedUrls] = useState<string[]>([]);

  const lead = useMemo(() => ({
    businessName: businessName || "votre entreprise",
    website,
    performance: numberParam(params.get("performance")),
    seo: numberParam(params.get("seo")),
    accessibility: numberParam(params.get("accessibility")),
    weakScore: numberParam(params.get("weakScore")),
    reasons: params.get("reasons") || "site mobile, vitesse, SEO"
  }), [businessName, website, params]);

  const to = manualEmail.trim() || selectedEmail;

  async function findEmail() {
    setLoadingEmail(true);
    setError("");
    setStatus("");
    setEmails([]);
    setSelectedEmail("");
    setCheckedUrls([]);

    try {
      const response = await fetch("/api/find-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website })
      });
      const data: FindEmailResponse & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao procurar email.");
      setEmails(data.emails || []);
      setSelectedEmail(data.emails?.[0] || "");
      setCheckedUrls(data.checkedUrls || []);
      setStatus(data.emails?.length ? "Email encontrado. Confirma antes de enviar." : "Não encontrei email no site. Podes meter manualmente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setLoadingEmail(false);
    }
  }

  async function sendEmail() {
    setSending(true);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, ...lead })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao enviar email.");
      setStatus("Email enviado com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="outreach-page">
        <section className="outreach-hero">
          <div className="hero-bg" />
          <div className="container outreach-grid">
            <div>
              <span className="eyebrow">Outreach semi-automático</span>
              <h1>Encontra o email e envia um pitch bonito.</h1>
              <p className="lead-text">O sistema procura emails no site, prepara uma mensagem HTML profissional e tu confirmas o envio manualmente.</p>
            </div>
            <div className="outreach-card">
              <label>Nome do negócio</label>
              <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Salon Exemple" />
              <label>Website</label>
              <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://site.fr" />
              <button className="btn full" disabled={!website || loadingEmail} onClick={findEmail}>
                {loadingEmail ? "A procurar email..." : <><Search size={18} /> Detectar email</>}
              </button>
            </div>
          </div>
        </section>

        <section className="results-section compact">
          <div className="container outreach-layout">
            <div className="panel outreach-panel">
              <div className="toolbar small-toolbar">
                <div>
                  <h2>Contacto</h2>
                  <p className="muted">Confirma sempre antes de enviar.</p>
                </div>
              </div>

              <div className="form-block">
                <label>Emails encontrados</label>
                <div className="email-list">
                  {emails.length ? emails.map((email) => (
                    <button key={email} className={selectedEmail === email ? "email-chip active" : "email-chip"} onClick={() => setSelectedEmail(email)}>
                      <Mail size={14} /> {email}
                    </button>
                  )) : <div className="empty small">Ainda sem emails encontrados.</div>}
                </div>

                <label>Ou mete email manual</label>
                <input className="input" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} placeholder="contact@site.fr" />

                <button className="btn full" disabled={!to || sending} onClick={sendEmail}>
                  {sending ? "A enviar..." : <><Send size={18} /> Enviar email</>}
                </button>

                {status && <div className="success"><CheckCircle2 size={18} /> {status}</div>}
                {error && <div className="error">{error}</div>}
              </div>
            </div>

            <div className="panel outreach-panel preview-panel">
              <div className="toolbar small-toolbar">
                <div>
                  <h2>Preview</h2>
                  <p className="muted">Mensagem que será enviada.</p>
                </div>
              </div>
              <div className="email-preview">
                <p className="subject">Sujet: Amélioration possible de votre site {lead.businessName}</p>
                <h3>Bonjour {lead.businessName},</h3>
                <p>J’ai analysé rapidement votre site web et j’ai remarqué plusieurs points qui pourraient être améliorés, surtout sur mobile.</p>
                <div className="audit-box">
                  <span>Site: {website || "https://site.fr"}</span>
                  <span>Performance: {lead.performance}/100</span>
                  <span>SEO: {lead.seo}/100</span>
                  <span>Accessibilité: {lead.accessibility}/100</span>
                </div>
                <p>Je peux vous aider à moderniser le design, améliorer la vitesse mobile et augmenter les demandes de contact ou réservations.</p>
                <p>Si vous le souhaitez, je peux vous envoyer gratuitement 2 ou 3 idées concrètes d’amélioration.</p>
                <b>Bien cordialement,<br />Rafael</b>
              </div>

              {checkedUrls.length > 0 && (
                <div className="checked">
                  <strong>URLs verificadas</strong>
                  {checkedUrls.map((url) => <a href={url} target="_blank" key={url}><ExternalLink size={12} /> {url}</a>)}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      <footer className="footer">Não envies spam em massa. Usa contacto manual e personalizado.</footer>
    </>
  );
}
