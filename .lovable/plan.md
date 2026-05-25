# Piano implementazione — Software prerequisiti per il sito di vendita

L'implementazione è divisa in **6 fasi atomiche**. Ogni fase è auto-contenuta, testabile, e non rompe le funzionalità esistenti. Eseguiamo una fase per volta, con verifica prima della successiva.

---

## FASE 1 — Multi-tenancy foundation (DB + RLS)

**Obiettivo**: introdurre il concetto di "organizzazione" (studio) senza modificare le funzionalità esistenti.

Tabelle nuove:
- `organizations` (id, name, slug, custom_domain, branding jsonb, created_at)
- `organization_members` (org_id, user_id, joined_at, is_owner)
- `organization_role_labels` (org_id, base_role app_role, custom_label) — **solo rename**, no permessi custom

Funzione security definer:
- `is_org_member(org_id uuid)` → bool
- `get_user_org()` → uuid (organizzazione attiva dell'utente corrente)

Migrazione dati esistenti:
- Creo 1 organizzazione di default "Studio Scope" e ci attacco tutti gli utenti correnti come membri
- Aggiungo colonna `organization_id` a `projects` (nullable inizialmente, poi backfill, poi NOT NULL)
- **Non tocco RLS esistenti in questa fase** — solo aggiungo strutture

Output: DB pronto per multi-tenancy, app continua a funzionare identica.

---

## FASE 2 — Subscription state machine

Tabella `organization_subscriptions`:
- org_id, tier (`starter`|`pro`|`business`), billing_cycle (`monthly`|`annual`)
- status (`active`|`past_due`|`data_retention`|`purged`|`cancelled`)
- current_period_end, retention_until, cancelled_at
- stripe_customer_id, stripe_subscription_id (preparazione)

Edge function `check-subscription-status` (cron giornaliero):
- past_due → data_retention dopo X giorni (15/30/90 per tier)
- data_retention → purged dopo periodo
- emit notifiche email

Hook `useSubscription()` lato client + componente **`SubscriptionGate`** che blocca l'accesso al software se status ≠ active. Mostra splash "Pagamento sospeso — riprendi su [link]".

---

## FASE 3 — Capability packs + role labels custom

`src/lib/capabilities.ts`: 11 ruoli base con capability fissi (`view_costs`, `approve_design`, `manage_suppliers`, `manage_team`, ecc.). Sostituisce il check `roles.includes('admin')` sparso nel codice con `hasCapability('manage_team')`.

UI in `/admin/roles`: l'admin dello studio può **rinominare** un ruolo base (es. "Project Manager" → "Andrew"). Nessun pulsante "crea ruolo nuovo".

Refactor minimo: `useUserRole` aggiunge `getLabel(role)` che legge `organization_role_labels`.

---

## FASE 4 — Archived projects + tier limits

Aggiunge a `projects`:
- `is_archived` boolean default false
- `archived_at` timestamp
- `archived_reason` text

Logica:
- Tier limits su progetti **attivi** (Starter 2, Pro 8, Business unlimited) — archiviati illimitati
- Archive = read-only (RLS blocca INSERT/UPDATE su `project_items` se progetto archiviato)
- Riaprire un archiviato consuma uno slot attivo; trigger conta riaperture/mese → se >2 richiede addon

Aggiornamento `src/lib/subscriptionTiers.ts` con i nuovi limiti definiti.

UI: pulsanti Archive/Unarchive nella card progetto, filtro "Attivi/Archiviati/Tutti" nella dashboard.

---

## FASE 5 — Referral + discount codes

Tabelle:
- `referral_codes` (user_id, code, created_at, is_active)
- `referrals` (referrer_user_id, referred_org_id, attributed_at, status)
- `referral_commissions` (referral_id, amount, period, paid_at, payout_method)
- `discount_codes` (code, type `percent_off`|`free_access`|`agent_ref`, value, max_uses, valid_until, created_by)
- `discount_code_usages` (code_id, org_id, applied_at)

Onboarding form (per ora solo nel software, poi migrerà al sito):
- Campo opzionale "Codice promo" + auto-detect `?ref=ABCD` dall'URL
- Edge function `validate-discount-code` + `register-referral-attribution`

Dashboard utente `/profile/referral`: codice personale, link condivisibile, totale commissioni.
Admin panel `/admin/referrals` + `/admin/discount-codes`.

---

## FASE 6 — Edge functions server-to-server per il sito esterno

Edge functions con API key dedicata (`SITE_INTEGRATION_KEY`):
- `POST /create-organization` — chiamata da onboarding sito
- `GET /read-subscription/:org_id`
- `POST /update-subscription-status` (webhook Stripe/Paddle)
- `POST /validate-invite-token`
- `POST /register-domain` (CNAME setup)
- `POST /validate-discount-code` (pubblica, per il sito)

Documentazione `docs/SITE_INTEGRATION_API.md` da consegnare al web expert.

---

## Note tecniche trasversali

- **Non si tocca** `src/integrations/supabase/client.ts` né `types.ts` (rigenerati da Lovable).
- Ogni fase ha la sua migrazione SQL separata e idempotente.
- Tutte le RLS nuove usano security definer functions per evitare ricorsioni.
- `LOVABLE_API_KEY` già presente → ok per le edge functions.
- Manteniamo `localStorage` di `subscriptionTiers.ts` come fallback dev finché Stripe non è collegato.

---

## Cosa propongo ora

Comincio con la **FASE 1** (foundation multi-tenancy): è la base di tutto e a livello utente non cambia nulla di visibile. Ti chiedo conferma prima di partire con la migrazione SQL — una volta create le tabelle e fatto il backfill, le fasi successive scorrono in cascata.

Confermi di partire con FASE 1?
