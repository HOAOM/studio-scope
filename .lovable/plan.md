## Dove siamo oggi (stima realistica: ~70-75%, non 80%)

**Fatto bene**
- Core funzionale: BOQ Analyst, Item Detail Modal, Gantt, Procurement, Client Boards, Presentation Builder, Supplier Exports
- Auth Supabase + 11 ruoli + RLS sulle tabelle principali
- Workflow.ts come engine unificato del ciclo di vita item
- 3 tier definiti in `subscriptionTiers.ts` (ma solo localStorage, nessun billing reale)
- Lovable Cloud configurato, edge function `admin-users`

**Gap critici che bloccano il go-live**
1. **Nessun billing reale** — i tier sono solo client-side, chiunque può fare `localStorage.setItem` e diventare Enterprise
2. **Multi-tenancy mancante** — non esiste concetto di "organizzazione/workspace": tutti gli utenti vedono gli stessi suppliers/master data/company_settings. Non si può vendere a più studi senza isolamento
3. **RLS scoperta su tabelle sensibili** — `suppliers` ha `auth_read_suppliers USING true` e `auth_update_suppliers USING true`: ogni utente legge e modifica fornitori di tutti
4. **Onboarding zero** — niente signup flow commerciale, niente landing page, niente pagina pricing pubblica
5. **Branding hard-coded** — `company_settings` è singleton globale, non per-tenant: nessun white-label reale
6. **Architettura add-on inesistente** — niente sistema di feature flag dinamici per attivare moduli a pagamento
7. **Email transazionali non configurate** — niente welcome, niente reminder pagamento, niente notifiche scadenza trial
8. **Test su larga scala mai fatti** — performance, indici DB, paginazione 1000-row limit Supabase non verificati
9. **Production-readiness** — niente error tracking (Sentry), niente analytics prodotto, niente backup policy documentata, niente Terms/Privacy/GDPR

---

## Piano in 5 fasi (6-8 settimane realistiche)

### FASE 1 — Hardening sicurezza e multi-tenancy (settimana 1-2)
Senza questo non si vende: oggi un cliente vede i fornitori e i dati dell'altro.

1. **Migration `organizations`**: nuova tabella `organizations` (id, name, slug, logo_url, primary_color, vat_number, address, subscription_tier, trial_ends_at, paddle_customer_id, paddle_subscription_id). Tabella `organization_members` (org_id, user_id, role).
2. **Colonna `organization_id`** su: `projects`, `suppliers`, `company_settings` (rinominato `organization_branding`), `master_floors/rooms/item_types/subcategories` (opzionale: master globali vs per-org), `presentations`, `client_boards`, tutti i `*_documents`.
3. **Refactor RLS**: nuova security definer function `is_org_member(org_id)`. Riscrivere tutte le policy `auth_read_suppliers true` → `is_org_member(suppliers.organization_id)`. Stesso per company_settings, suppliers, cost_categories.
4. **Backfill**: creare un'org "Default Studio" per ogni owner esistente, agganciare i dati storici.
5. **Org switcher** nella UI (per chi sta in più org) + onboarding "crea il tuo studio" al primo login.

### FASE 2 — Billing Paddle + tier dinamici (settimana 2-3)
**Provider: Paddle** (Merchant of Record). Eligibility check già superato. Vantaggio: gestisce IVA EU, fatturazione, compliance — zero burocrazia per te.

1. **Enable Paddle** via `enable_paddle_payments` (test env immediato, live dopo verifica account).
2. **Catalogo prodotti su Paddle**:
   - **Subscription base**: Studio Base 49€/mo, Studio Pro 149€/mo, Enterprise (contact sales). Trial 14 giorni, sconto -20% annuale.
   - **Add-on a consumo/quantità**: "Progetto extra" 10€/mo cad., "Utente extra" 15€/mo cad.
   - **Add-on modulari** (feature flag): "Modulo Taglio Marmi" 39€/mo, "Modulo Piano Installazione Piastrelle" 39€/mo (pronti per i moduli futuri).
   - **One-time**: "Onboarding & Training Pro" 490€ (anche se hai detto training libero per tutti, lo teniamo come upsell premium opzionale).
3. **Tabella `organization_subscriptions`** in Supabase: org_id, paddle_subscription_id, tier, status (trialing/active/past_due/canceled), addons jsonb (lista feature flag attivi), seats_extra, projects_extra, current_period_end.
4. **Webhook Paddle** in edge function `paddle-webhook`: gestisce `subscription.created/updated/canceled`, `transaction.completed`, aggiorna `organization_subscriptions`.
5. **Refactor `useSubscriptionTier`**: legge da DB (org corrente) non più da localStorage. `hasFeature()` controlla sia tier sia `addons[]`.
6. **Enforcement reale**:
   - Blocco creazione progetto oltre `maxProjects + projects_extra`
   - Blocco invito utente oltre `maxTotalUsers + seats_extra`
   - Banner upgrade contestuale quando un addon è richiesto
7. **Customer portal** (link Paddle hosted) per gestire subscription/payment method/fatture dalla UI.

### FASE 3 — White-label, onboarding, landing pubblica (settimana 3-4)
Hai detto: tutti devono poter mettere logo e nome. Quindi il white-label è incluso nel tier base, non upsell.

1. **Branding per-org** (tabella `organization_branding`): logo_url (Supabase Storage), primary_color, company_name, vat_number, address — usati ovunque oggi `useCompanySettings` è chiamato (PDF, header, client boards, presentation, supplier exports).
2. **Onboarding wizard post-signup** (5 step): nome studio → logo → colore primario → invita team → crea primo progetto. Già esiste `OnboardingWizard.tsx`, va esteso e legato all'org creation.
3. **Landing page pubblica** (`/` non autenticato): hero, feature highlights, pricing table dinamica letta da Paddle prices, CTA "Inizia trial 14 giorni", form contatto enterprise. Route `/auth` separata. SEO base (title/meta/JSON-LD).
4. **Training & docs hub** (`/help` o sottodominio Notion/Mintlify): video, guide, KB. Linkato dall'app. Accesso libero per tutti come da richiesta.
5. **Pagine legali**: Terms, Privacy, Cookie, DPA. Footer landing + checkout Paddle ne richiede i link.

### FASE 4 — Architettura add-on estensibile (settimana 4-5)
Per i moduli futuri (taglio marmi, piano installazione piastrelle, etc.) serve un'architettura che NON ti costringa a refactor ogni volta.

1. **Feature flag registry** (`src/lib/featureModules.ts`): registro centrale `{ id, label, paddle_price_id, route, component, requiredTier? }`.
2. **Module loader**: route dinamiche `/project/:id/modules/:moduleId` che si aggiungono ai tab del ProjectDetail solo se `org.addons.includes(moduleId)`.
3. **Skeleton "Modulo Taglio Marmi"**: tab placeholder con CTA "Attiva modulo (39€/mo)" che apre Paddle checkout overlay. Stessa cosa per "Piano Installazione Piastrelle". Implementazione funzionale dei moduli = fase post-lancio.
4. **Admin dashboard tier** già esiste (`SubscriptionTierPanel`), va rifatto per leggere/scrivere su DB e mostrare add-on attivi/disponibili.

### FASE 5 — Quality, observability, lancio (settimana 5-6+)

1. **Email transazionali** (Lovable Email): welcome, conferma trial, 3gg prima fine trial, payment failed, invito team. Branded con logo org.
2. **Test su larga scala**: seed 50 progetti, 5000 items, 200 quotations. Verifica paginazione (limite 1000 Supabase), indici su `project_items(project_id, lifecycle_status)`, `direct_messages(project_id, created_at)`. Profiling Gantt con 500 task.
3. **Error tracking**: Sentry (free tier ok) per FE + edge functions.
4. **Product analytics**: PostHog o Plausible per funnel signup→trial→paid, feature adoption.
5. **Backup & DR**: documenta che Lovable Cloud fa snapshot, esponi export CSV per ogni tabella critica dall'admin panel.
6. **Security scan finale**: `security--run_security_scan` + linter Supabase, fix tutti gli HIGH.
7. **Dominio custom** (es. app.studioscope.io), HIBP password check attivo, rate limiting consapevolezza (Lovable non offre primitive — accettato).
8. **Soft launch**: 5-10 studi paganti early adopter scontati -50% primi 3 mesi in cambio di feedback intensivo.

---

## Dettagli tecnici chiave

- **Stack billing**: Paddle Billing (non Classic), webhook con signature verification HMAC-SHA256 in edge function.
- **Trial gestito da Paddle** (non da noi) → semplifica logica, status `trialing` sincronizzato via webhook.
- **Seats add-on**: usare Paddle "quantity" su un price ricorrente, sincronizzato a `seats_extra` quando admin invita utente oltre limite (chiama `paddle.subscriptions.update`).
- **Currency**: EUR default, multi-currency Paddle gestisce automaticamente al checkout.
- **Migrations**: ogni step DB side-by-side (mantieni colonna vecchia + nuova fino a backfill ok, poi drop) come da memoria `database-migration-strategy`.
- **Niente rate limiting backend**: noto gap Lovable, OK così.

## Cosa NON è in questo piano (deliberatamente)
- Mobile app nativa (PWA installabile è già ok da preview)
- Implementazione funzionale completa moduli Taglio Marmi / Piano Piastrelle (solo skeleton + billing pronto — li costruisci dopo il lancio)
- Marketplace template/preset (post v3)
- Integrazione Revit/AutoCAD nativa (oggi solo import CSV)

## Output finale

Alla fine delle 5 fasi avrai: app multi-tenant sicura, billing Paddle live con 3 tier + 5 add-on, white-label per ogni cliente, landing + pricing pubbliche, onboarding guidato, email branded, observability di base, 5-10 studi paganti reali in beta.

**Procediamo dalla Fase 1 (sicurezza + multi-tenancy)?** È il prerequisito assoluto: senza non puoi nemmeno mostrare l'app a un secondo studio.