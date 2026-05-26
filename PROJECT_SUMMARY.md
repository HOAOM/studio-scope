# Studio Scope — Documento Riepilogativo Totale

> **Ultimo aggiornamento:** 26 maggio 2026 — dopo Fase 6 + storage limits  
> **Stato progetto:** beta multi-tenant pronta, in attesa di rilascio  
> **Manutenzione di questo file:** aggiornato automaticamente ad ogni fase/cambio significativo

---

## 1. Identificativi del progetto

| Voce | Valore |
|------|--------|
| Nome prodotto | Studio Scope |
| Lovable Project ID | `297bf69d-76a9-413c-acbd-b03e8e1209e6` |
| Preview URL | https://id-preview--297bf69d-76a9-413c-acbd-b03e8e1209e6.lovable.app |
| Published URL | https://studio-scope.lovable.app |
| Backend | Lovable Cloud (gestito) |
| Backend project ref | `grpzbxwafkcvecphnyyb` |
| Backend URL base | https://grpzbxwafkcvecphnyyb.supabase.co |

---

## 2. Architettura in 2 righe

App **multi-tenant** (un software, tanti studi clienti). Ogni studio = una **Organizzazione**, con il suo abbonamento, i suoi progetti, i suoi utenti, opzionalmente il suo dominio. Tu sei admin globale; ogni studio ha il suo owner.

---

## 3. Modello commerciale (tier)

| Tier | Progetti attivi | Storage | Riaperture/mese | Grace period | Purge dopo |
|------|----------------|---------|-----------------|--------------|------------|
| **Starter** | 2 | 2 GB | 2 | 15 giorni | 30 giorni |
| **Pro** | 8 | 10 GB | 2 | 30 giorni | 60 giorni |
| **Business** | illimitati | illimitato | 2 | 90 giorni | 180 giorni |

**Ciclo di vita abbonamento:** `active` → `grace` (in ritardo) → `suspended` (bloccato) → `purge_pending` (dati cancellati). Gestito dalla funzione DB `tick_subscription_lifecycle()` (da agganciare a cron giornaliero).

**Calcolo finanziario item:** `Sale Price = (Subtotal + Landed Costs) × (1 + Margin%)`

---

## 4. Le 7 fasi rilasciate

| Fase | Cosa fa | Stato |
|------|---------|-------|
| 1 | Organizzazioni + membri (multi-tenant base) | ✅ |
| 2 | Abbonamenti + ciclo di vita stato | ✅ |
| 3 | Etichette ruolo personalizzabili per org | ✅ |
| 4 | Archiviazione progetti + limiti per tier | ✅ |
| 5 | Programma referral + codici sconto | ✅ |
| 6 | Edge function `site-api` per il sito di vendita | ✅ |
| 7 | Limiti storage per tier (2/10/∞ GB) | ✅ |

Niente è stato rimosso. Tutte le tabelle pre-fasi sono intatte.

---

## 5. Ruoli (`app_role` enum)

11 ruoli, **etichette personalizzabili per org** (Fase 3), funzioni fisse:

`admin, coo, project_manager, head_of_design, designer, qs, finance, procurement, site_supervisor, client, supplier`

Regola chiave: **costi e margini sono sempre nascosti** ai ruoli `client` e `designer`.

---

## 6. Account di test (beta)

Password unica: `Def@ult01`  
Tutti su dominio `@test.it`:

```
admin@test.it           → admin
coo@test.it             → coo
pm@test.it              → project_manager
hod@test.it             → head_of_design
designer@test.it        → designer
qs@test.it              → qs
finance@test.it         → finance
procurement@test.it     → procurement
site@test.it            → site_supervisor
client@test.it          → client
supplier@test.it        → supplier
```

Auto-conferma email **attiva** (per beta). Da disattivare prima del rilascio pubblico se si vuole verifica reale.

---

## 7. Site Integration API (Fase 6)

**Endpoint base:**  
`https://grpzbxwafkcvecphnyyb.supabase.co/functions/v1/site-api`

**Autenticazione:** header `x-site-api-key: <SITE_API_KEY>` (secret salvato in Lovable Cloud — solo tu lo conosci; consegnalo al web expert via password manager).

**Endpoint disponibili:**

| Metodo | Path | Funzione |
|--------|------|----------|
| GET  | `/health` | Ping di servizio |
| POST | `/organizations` | Crea org + utente owner + abbonamento |
| POST | `/subscription/sync` | Aggiorna stato abbonamento (da Stripe o manuale) |
| POST | `/discount/validate` | Verifica validità codice sconto |
| POST | `/discount/redeem` | Riscatta codice sconto |
| POST | `/referral/apply` | Applica codice referral |
| POST | `/custom-domain` | Assegna dominio custom a org |
| GET  | `/org/lookup?slug=` `?domain=` `?id=` | Cerca organizzazione |

Documentazione completa per il web expert: file `SITE_INTEGRATION_API.md` nella root del progetto.

---

## 8. Edge Functions deployate

| Nome | Scopo | Auth |
|------|-------|------|
| `site-api` | API pubblica per sito esterno (Fase 6) | `x-site-api-key` |
| `admin-users` | Gestione utenti/ruoli da pannello admin | JWT admin |
| `run-migration-phase1` | Migration fondamenta multi-tenant | JWT admin |
| `run-migration-phase2` | Migration abbonamenti | JWT admin |
| `run-migration-phase3` | Migration etichette ruoli | JWT admin |
| `run-migration-phase4` | Migration archive + limiti | JWT admin |
| `run-migration-phase5` | Migration referral + sconti | JWT admin |
| `run-migration-phase7` | Migration storage limits | JWT admin |

Le migration sono **idempotenti** — possono essere rieseguite senza danno.

---

## 9. Secrets configurati

| Nome | Note |
|------|------|
| `SITE_API_KEY` | Chiave condivisa con il sito esterno. **Solo tu la conosci.** |
| `LOVABLE_API_KEY` | Gateway AI Lovable (auto) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEY(S)`, `SUPABASE_SECRET_KEYS` | Gestiti automaticamente da Lovable Cloud |

---

## 10. Database — funzioni helper principali

| Funzione | Uso |
|----------|-----|
| `has_role(user_id, role)` | Check ruolo (usata in tutte le RLS policy) |
| `is_org_member(org_id)` / `is_org_owner(org_id)` | Check membership organizzazione |
| `is_project_member(project_id)` / `is_project_owner(project_id)` | Check accesso progetto |
| `tier_project_limit(tier)` | 2 / 8 / `MAX_INT` |
| `tier_storage_limit_gb(tier)` | 2 / 10 / `NULL` (illimitato) |
| `tier_storage_limit_bytes(tier)` | versione in byte |
| `validate_discount(code, org, tier)` | Verifica codice sconto |
| `redeem_discount(code, org)` | Riscatta codice |
| `apply_referral(code, org)` | Applica referral |
| `tick_subscription_lifecycle()` | Avanza stati abbonamento (cron daily) |
| `enforce_project_archive_rules()` | Trigger: blocca creazione/riapertura oltre limite |
| `auto_create_referral_code()` | Trigger: ogni nuova org riceve codice referral |
| `generate_item_code()` | Trigger: genera codice BOQ univoco |

---

## 11. Tabelle principali (35 totali)

**Multi-tenant & billing (Fasi 1-5, 7):**  
`organizations`, `organization_members`, `organization_subscriptions`, `organization_role_labels`, `discount_codes`, `discount_redemptions`, `referral_codes`, `referral_redemptions`, `project_reopen_log`

**Core operativo:**  
`projects`, `project_members`, `project_items`, `project_tasks`, `project_milestones`, `boq_coverage`, `client_boards`, `presentations`

**Procurement:**  
`suppliers`, `supplier_payments`, `supplier_comments`, `item_quotations`, `item_costs`, `cost_categories`

**Workflow & audit:**  
`item_revisions`, `item_messages`, `direct_messages`, `notifications`, `audit_log`

**Master data:**  
`master_floors`, `master_rooms`, `master_item_types`, `master_subcategories`, `company_settings`

**Utenti & auth:**  
`profiles`, `user_roles` (RLS sempre attiva)

---

## 12. Storage bucket

| Nome | Pubblico | Uso |
|------|----------|-----|
| `item-files` | Sì | Immagini di riferimento, disegni tecnici, proforme, documenti supplier |

> Quote storage (2/10/∞ GB) sono **definite** ma non ancora **enforced** lato app — da agganciare a un check pre-upload quando si attiverà il flusso pagamenti vero. Fino ad allora la quota è informativa.

---

## 13. Cosa manca prima del rilascio pubblico

- [ ] Agganciare Stripe (oggi `subscription/sync` è pronto ma manuale).
- [ ] Cron giornaliero per `tick_subscription_lifecycle()`.
- [ ] Enforcement quota storage pre-upload (oggi solo dichiarato).
- [ ] Sito di vendita esterno (web expert) che usa `site-api`.
- [ ] Disattivare auto-conferma email se si vuole verifica reale per nuovi utenti.
- [ ] Test end-to-end con un'org Pro reale (creazione → uso → archivio → rinnovo).

---

## 14. Note operative

- **Backup**: Lovable Cloud fa backup automatici del DB. Per ridondanza extra, conservare anche questo file e il `SITE_INTEGRATION_API.md`.
- **Rotazione `SITE_API_KEY`**: se compromessa, generare nuova chiave dai secrets Lovable Cloud → aggiornare il sito esterno.
- **Espansione tier**: per cambiare limiti basta modificare `tier_project_limit` / `tier_storage_limit_gb` (file di migration phase 4 / phase 7).
- **Nuovi ruoli**: solo via codice (aggiunta a enum `app_role`), così i clienti non possono moltiplicarli.

---

## 15. Changelog di questo documento

| Data | Modifica |
|------|----------|
| 2026-05-26 | Versione iniziale, post-Fase 6 + storage limits (Fase 7) |
| 2026-05-26 | **Blocco 1 — Navigation refresh**: introdotta `ProjectSidebar` (`src/components/layout/ProjectSidebar.tsx`) che sostituisce la `TabsList` orizzontale in `ProjectDetail`. Layout responsive: desktop sidebar espansa, tablet icon-only, mobile offcanvas via `SidebarTrigger`. Header reso più compatto e responsive. |

---

*Documento mantenuto vivo. Ogni nuova fase/feature significativa verrà annotata qui sotto al rilascio.*
