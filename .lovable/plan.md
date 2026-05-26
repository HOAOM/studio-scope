## Blocco 4 — Console Super-Admin StudioScope

Obiettivo: separare nettamente **te (super-admin di StudioScope)** dai **tuoi clienti (org owner)**, abilitare i 3 domini di test, e dare la UI per gestire tier/codici/metriche senza toccare il DB a mano.

---

### 1. Modello & gerarchia (no schema changes — usa quello che c'è)

- **Super-admin StudioScope** = utente con `user_roles.role = 'admin'`. Vede TUTTO, può impersonare, gestisce tier/codici/metriche globali.
- **Org Owner** (cliente che compra) = `organization_members.is_owner = true`. Vede solo la sua org, invita membri, vede la propria subscription.
- **Org Member** = riga in `organization_members` senza is_owner; lavora nei progetti dell'org.
- **Bootstrap** scelto: NESSUNA auto-creazione. Le org nascono solo da: (a) super-admin che crea per un cliente, (b) checkout sul sito marketing (futuro), (c) invito in org esistente.

---

### 2. Cosa costruisco (Blocco 4a — questa iterazione)

#### A. Pagina `/super-admin` (solo `app_role = admin`)

Quattro tab, tutti dietro guard `has_role('admin')`:

1. **Organizations** — tabella con: nome, slug, owner email, tier, status, progetti attivi/limite, storage usato/limite, data creazione. Azioni inline:
   - cambia tier (starter/pro/business)
   - cambia status (active/grace/suspended)
   - "Impersonate" → setta `activeOrgId` su quella org e apre l'app come se fossi membro (read-aware: nel `OrgSwitcher` appare un badge giallo "VIEW-AS")
   - "Create organization for client" → dialog con nome, slug, email owner, tier iniziale, eventuale discount code

2. **Discount Codes** — CRUD su `discount_codes`: code, % off o amount off, scope tier/org, validità, max redemptions, redemptions totali.

3. **Referral Codes** — lista `referral_codes` con redemptions per org (read-only, generati automaticamente dal trigger `auto_create_referral_code` quando nasce un'org).

4. **Global Metrics** — card con: org totali per tier, MRR stimato (price × org attive per tier), org in grace/suspended (alert), nuove org ultimi 30gg, top 5 org per progetti attivi.

#### B. Bootstrap per i 3 domini di test

Edge function `bootstrap-client-org` (richiamata dal tab Organizations o via CLI):
- input: `{ owner_email, org_name, slug, tier, discount_code? }`
- crea `auth.users` se non esiste (password temporanea), inserisce `organization_members(is_owner=true)`, `organization_subscriptions(tier)`, applica eventuale referral/discount, ritorna magic link.
- usato dal dialog "Create organization for client" del super-admin.

#### C. Impersonate (view-as)

Niente JWT swap (rischioso). Strategia leggera:
- super-admin imposta `activeOrgId` su qualunque org → RLS continua a permettere SELECT perché ha `has_role('admin')` su quasi tutte le tabelle.
- Banner globale fisso in alto: "🟡 VIEW-AS: {org name} — Exit" che resetta a una sua org.
- `useActiveOrg` accetta org di cui non sei membro **se sei admin**.

#### D. Fix UX immediato per il tuo caso attuale

Sei admin ma senza org. `MembersPanel` mostra "no active organization". Soluzione:
- Se admin senza org propria, il pannello Members propone "Create your own studio org" + link al tab Organizations del super-admin.
- L'`OrgSwitcher` per super-admin mostra anche "All client organizations" come opzione.

---

### 3. File da creare/modificare

**Nuovi:**
- `src/pages/SuperAdmin.tsx` — pagina con 4 tab
- `src/components/super-admin/OrganizationsTable.tsx`
- `src/components/super-admin/CreateOrgDialog.tsx`
- `src/components/super-admin/DiscountCodesPanel.tsx`
- `src/components/super-admin/ReferralCodesPanel.tsx`
- `src/components/super-admin/GlobalMetricsPanel.tsx`
- `src/components/layout/ImpersonateBanner.tsx`
- `src/hooks/useAllOrganizations.ts` (admin-only)
- `supabase/functions/bootstrap-client-org/index.ts`
- `supabase/functions/run-migration-block4/index.ts` — aggiunge RPC `admin_list_all_orgs()`, `admin_global_metrics()`, `admin_set_org_tier(org, tier)`, `admin_set_org_status(org, status)` (tutte SECURITY DEFINER con guard `has_role('admin')`)

**Modificati:**
- `src/App.tsx` — route `/super-admin` con guard admin
- `src/components/warroom/UserMenu.tsx` — voce "Super Admin" visibile solo se admin
- `src/components/layout/OrgSwitcher.tsx` — admin può selezionare qualsiasi org
- `src/components/admin/MembersPanel.tsx` — fallback se admin senza org
- `PROJECT_SUMMARY.md` — sezione Blocco 4

---

### 4. Cosa NON faccio in questa iterazione

- Checkout pubblico sul sito marketing (lo farà il sito esterno; il super-admin per ora crea org a mano).
- Stripe billing reale (solo `notes` e `tier` manuali per ora — collegheremo Stripe quando deciderai il provider).
- JWT impersonation vera (basta il view-as via RLS admin).
- Mobile layout del super-admin (desktop-first, è uno strumento interno).

---

### 5. Test flow per i 3 domini

1. Logghi come admin StudioScope su preview.
2. Vai a `/super-admin → Organizations → Create`.
3. Crei "Studio Alfa" (tier pro, owner alfa@dominio1.com), "Studio Beta" (starter, beta@dominio2.com), "Studio Gamma" (business, gamma@dominio3.com).
4. Ricevi 3 magic link da condividere ai 3 indirizzi reali.
5. Da admin puoi "Impersonate" qualsiasi delle 3 per debug.

Procedo?