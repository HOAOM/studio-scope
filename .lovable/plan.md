
# Brief per lo sviluppatore del sito di vendita — v3

Aggiornamenti rispetto a v2: **ruoli custom solo lato nostro** (lo studio può solo rinominare), **niente trial — rimborso 15 giorni su annuale**, **sistema referral + codici sconto** completo.

---

## 1. Cosa è il prodotto

Software SaaS per studi di interior design e contractor di hospitality. Gestisce un progetto dal preventivo (BOQ) all'installazione: BOQ Analyst, Gantt, Procurement, Supplier Exports, Costi/Margini, Messaging interno, 11 ruoli granulari. 3 tier + addon componibili.

Nome prodotto: in scelta tra Nooka / Velvo / Krate / Lumio. Software interno = StudioScope. Dominio di test: `amz.ee` + `app.amz.ee`.

---

## 2. Tier e limiti

| | **Starter** | **Pro** | **Business** |
|---|---|---|---|
| Prezzo ipotesi mensile | 29 € | 89 € | 199 € |
| Prezzo ipotesi annuale (−15%) | 296 €/anno | 908 €/anno | 2.030 €/anno |
| Progetti **attivi** in parallelo | 2 | 8 | illimitati |
| Progetti archiviati | illimitati (read-only) | illimitati | illimitati |
| Utenti **per ruolo** | 1 | 5 | illimitati |
| Rinomina ruoli (label custom) | ✓ | ✓ | ✓ |
| Creazione ruoli custom da zero | ✗ | ✗ | ✗ |
| Supplier Exports (RFQ/PO/Proforma) | ✓ | ✓ | ✓ |
| BOQ + Gantt + Procurement | ✓ | ✓ | ✓ |
| Branding custom + dominio proprio | base | ✓ | ✓ |
| Import Excel massivo | — | ✓ | ✓ |
| Audit log | 30 gg | 12 mesi | illimitato |
| Retention dopo mancato pagamento | 15 gg | 30 gg | 90 gg |

Addon componibili (qualsiasi tier): Client Boards 19 €/mese, Presentation Builder 19 €/mese, Progetto extra 8 €/mese, Slot ruolo extra 12 €/mese.

Addon nascosto (su richiesta): Disaster Recovery — fee di recupero una tantum (~290 €) + opzionale 19 €/mese.

---

## 3. Ruoli — regole rigide

**Solo NOI possiamo creare nuovi ruoli o capability packs.** Distribuiamo gli aggiornamenti via release del software.

Lo studio cliente può **solo rinominare l'etichetta visualizzata** di ogni ruolo del proprio account. Il ruolo tecnico sottostante (e i suoi permessi) restano invariati.

Esempio: lo studio cambia "Project Manager" → "Andrew", "COO" → "Marco". L'utente Marco resta tecnicamente un `coo` con i permessi del COO; cambia solo il label nell'UI e nei PDF di quello studio.

Motivazione (anti-abuso): se i clienti potessero creare ruoli, uno studio Business potrebbe sottoscrivere Starter e gonfiare permessi/utenti aggirando il modello commerciale.

Implementazione: tabella `organization_role_labels` con `(organization_id, base_role, custom_label)`. Nessuna tabella `organization_roles` con permessi liberi.

I 11 ruoli base attuali restano fissi (admin, coo, ceo, designer, head_of_design, architectural_dept, qs, accountant, head_of_payments, procurement_manager, project_manager, site_engineer, mep_engineer, client). Espansioni future le rilasciamo NOI.

---

## 4. Modello pagamento — no trial, rimborso 15 giorni

**Niente "free trial".** Il cliente paga subito.

Due piani:
- **Mensile** — addebito ricorrente. Nessun rimborso retroattivo, cancellabile in qualsiasi momento (resta attivo fino a fine periodo pagato).
- **Annuale** (−15%) — addebito unico. **Money-back guarantee 15 giorni**: se l'admin dello studio chiede rimborso entro 15 giorni dalla data di pagamento, ottiene il 100% indietro e l'account passa subito in `data_retention`.

Pulsante "Richiedi rimborso" visibile in `Billing` solo se: piano annuale + giorni dal pagamento ≤ 15. Stripe/Paddle hanno API native per il rimborso programmato.

Stati abbonamento (invariato vs v2): `active` / `past_due` (3 gg di tolleranza) / `suspended` (app bloccata, pagina solo per aggiornare il metodo) / `data_retention` (15/30/90 gg in base al tier) / `purged`.

---

## 5. Programma Referral

### Fase 1 — apertura mercato (chiunque può referenziare)

- Ogni utente registrato (anche **senza** subscription attiva) ottiene un **referral code univoco** alla signup. URL: `https://[sito]/?ref=ABCD1234`.
- Quando un nuovo cliente paga usando quel referral code, il referrer riceve **10% di ogni pagamento andato a buon fine** del referred, **finché entrambi gli account restano attivi**.
- Payout mensile via Stripe/Paddle Connect (bonifico o PayPal), soglia minima 50 €.
- Il referrer vede in dashboard: codice, link condivisibile, n. referred attivi, commissioni maturate / pagate / in attesa.

### Fase 2 — restrizione (decisione futura nostra)

Stesso meccanismo ma il referrer deve avere un abbonamento attivo per ricevere commissioni. **Eccezioni manuali decise da te** (es. partner strategici grandfathered). Implementazione: flag `referral_grandfathered = true` sulla riga utente.

### Codici sconto (separati dal referral)

Tre tipi di codici, gestiti in pagina admin nostra (`/admin/discount-codes`):

1. **% sconto per N mesi/cicli** — es. `LAUNCH50` = 50% per i primi 3 mesi.
2. **Codice agente referral** — al checkout il cliente lo inserisce, l'agente collegato a quel codice riceve la commissione (alternativa al link `?ref=`, utile per agenti offline). Es. `MARCO2026`.
3. **Accesso gratuito totale** — 100% sconto a tempo indeterminato o per N mesi. Da usare per partner strategici, beta tester, influencer iniziali. Es. `BETA-VIP-001`.

Ogni codice ha: `code`, `kind` (`percent` | `agent` | `free_access`), `value`, `valid_from`, `valid_until`, `max_uses`, `usage_count`, `applies_to_tier`, `linked_agent_id` (per kind `agent`), `notes`. Tracciato uso per codice → cliente.

### Tabelle DB nuove

- `referral_codes` — id, user_id, code (univoco, generato), created_at, total_referred, total_earned_eur.
- `referrals` — id, referrer_user_id, referred_organization_id, status (`pending|active|churned|grandfathered`), first_payment_at, last_commission_at.
- `referral_commissions` — id, referral_id, invoice_id, amount_eur, status (`accrued|paid|reversed`), paid_at, payout_method.
- `discount_codes` — id, code, kind, value, valid_from, valid_until, max_uses, usage_count, applies_to_tier, linked_agent_id, notes, created_at.
- `discount_code_usages` — id, code_id, organization_id, applied_at, stripe_coupon_id.

Tutti coperti da RLS: l'utente vede solo i suoi referral e commissioni; admin nostro (super-admin) vede tutto.

---

## 6. Onboarding sul sito (5 step)

Invariato vs v2, con due modifiche:
- Step 3 "Ruoli": lo studio vede gli 11 ruoli **già attivi**, può solo cliccare "Rinomina" per ognuno. Niente "crea nuovo ruolo".
- Checkout: campo "Codice promo" opzionale + auto-rilevamento `?ref=` da URL.

```text
Step 1 — Studio (nome, paese, P.IVA, logo, colore)
Step 2 — Dominio (sottodominio nostro / dominio proprio via DNS / acquisto)
Step 3 — Rinomina ruoli (opzionale)
Step 4 — Invita team (email + ruolo, magic link)
Step 5 — Conferma → app.dominio-studio
```

---

## 7. Pagine sito

Landing, Features (1 per macro-area), **Pricing** (3 tier + addon, toggle Mensile/Annuale, banner "Annuale: 15 gg di rimborso garantito"), Per chi è, Demo/video, Login, Signup/Checkout, Onboarding wizard, Billing/Account (fatture, rimborso annuale, dominio, addon, **referral dashboard**, **codice promo**), Legali, Help center vuoto.

Niente pagina "Training/Academy". Training su canale YouTube esterno non sponsorizzato.

---

## 8. Stack tecnico

- Sito: a scelta dell'esperto (Next.js + Stripe o Paddle è lo standard).
- Pagamenti: **Paddle** consigliato (gestisce IVA EU, rimborsi, fatturazione globale). Stripe accettabile alternativa.
- Database: condiviso con il software (Lovable Cloud / Postgres + RLS).
- Auth: condivisa (signup nel checkout, login funziona ovunque).
- Domini studio: wildcard `*.[nostro-dominio]` + CNAME custom + SSL Let's Encrypt automatico.

Webhook critici da gestire sul sito (oltre a quelli di v2):
- `invoice.paid` → calcola commissione referral 10% e crea riga `referral_commissions`.
- `charge.refunded` (entro 15 gg, annuale) → status → `data_retention`, reversione commissione referral.
- `customer.subscription.deleted` → marca referral come `churned`.

### Tabelle multi-tenant (DB lavoro lato nostro)

`organizations`, `organization_members`, `organization_role_labels` *(NON `organization_roles`)*, `organization_subscriptions`, `organization_domains`, `organization_invoices`, `organization_backups`, + `referral_*` e `discount_*` di §5. Colonna `organization_id` + RLS `is_org_member()` su ogni tabella dati.

---

## 9. Cosa resta a noi in Lovable

- Multi-tenancy (organizations + RLS riscritta + organization_id ovunque)
- Sistema stati abbonamento + splash blocco app
- `organization_role_labels` + UI rinomina ruoli in onboarding e admin
- Sistema feature flag (Client Boards, Presentation = addon attivabili)
- `projects.is_archived` + edge function conteggio attivi + regola riapertura
- Job notturno backup → NAS
- Endpoint server-to-server per il sito: create-org, read-subscription, validate-invite, register-domain, **validate-discount-code**, **register-referral-attribution**
- Pannello admin `/admin/referrals` (lista referrer, commissioni, payout) + `/admin/discount-codes` (CRUD codici)
- Dashboard referral per utente finale dentro `/account`

Prerequisito: multi-tenancy + sistema abbonamenti + referral/discount devono esistere PRIMA che l'esperto del sito implementi il checkout.

---

## 10. Cosa NON fare

- Niente trial gratuito.
- Niente possibilità per il cliente di creare ruoli da zero.
- Niente promozione pubblica del backup/recupero dati.
- Niente pagina training/academy sul sito.
- Niente prezzi "fittizi" tipo "da 9€": mostrare il prezzo reale del tier.

---

## 11. Cosa fornire all'esperto

1. Questo brief.
2. Demo del software in sola lettura.
3. Screenshot HQ.
4. Brand finale (quando scelto nome).
5. Lista partner registrar (Namecheap, Gandi, OpenSRS, Cloudflare).
6. **Specifica completa schema referral + discount** (questa sezione 5 + tabelle DB).
7. Feature matrix Excel definitiva.

---

**Quando approvi v3, posso:**
1. Esportare in PDF/Word per l'esperto, oppure
2. Iniziare l'implementazione lato software dei prerequisiti (multi-tenancy + role labels + tabelle referral/discount + stati abbonamento + archivio progetti).

Dimmi quale.
