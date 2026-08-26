# Weak Site Finder + Bulk Outreach

App Next.js pronta para:
- procurar sites fracos com Google Places + PageSpeed
- tentar encontrar email no site
- selecionar vários leads
- enviar email em lote com Resend

## Rodar localmente

```bash
npm install
npm run dev
```

Abre:

```txt
http://localhost:3000
```

## Variáveis .env

```env
GOOGLE_API_KEY=...
RESEND_API_KEY=...
EMAIL_FROM=Rafael <contact@rafynhadev.online>
EMAIL_REPLY_TO=rafynhabussiness@gmail.com
```

O domínio `rafynhadev.online` tem de estar Verified na Resend.

## Páginas

```txt
/leads      -> procura negócios, mede site, encontra email e seleciona leads
/outreach   -> envia email em lote para os leads selecionados
```

## Segurança de envio

O envio em lote está limitado a 20 emails por vez para reduzir risco de bloqueio/spam.
