
# Piano di riordino e consolidamento Studio Scope

Obiettivo: prendere tutto ciò che già esiste, **riorganizzarlo**, **sistemare le criticità** e **rendere l'app realmente utilizzabile da uno studio reale**. Niente onboarding in-app (sta sul sito di vendita). Focus su: navigazione, responsive, sicurezza tier, gestione account/inviti, e audit feature-per-feature.

Il piano è diviso in **6 blocchi** che eseguiremo in ordine. Ogni blocco è autonomo: alla fine di ognuno hai una versione usabile e si può fermare/riprendere.

---

## Blocco 1 — Navigazione: sidebar collassabile + responsive (la base visiva)

Riorganizziamo l'app intorno a una **sidebar sinistra** invece dei tab in alto. La sidebar:
- Si **collassa a icone** (modalità mini, sempre visibile su desktop/tablet).
- Si **nasconde in offcanvas** su mobile, richiamabile con bottone hamburger.
- Mostra la sezione attiva evidenziata.
- Include badge di notifica (chat, approvazioni in attesa, items in ritardo).

**Struttura sidebar dentro un progetto:**
```
[Logo studio]
─ Overview
─ BOQ Analyst
─ Gantt & Tasks
─ Approval Gate
─ Item Tracker
─ Client Boards
─ Supplier Docs
─ Presentation
─ Chat                 [● 3]
─────────────
─ ← Torna ai progetti
```

**Header in alto** (sempre visibile, sottile): nome progetto + breadcrumb + avatar utente + notifiche globali + bottone collapse sidebar.

**Responsive:**
- **Desktop ≥1280px**: sidebar espansa di default (240px), contenuto fluido.
- **Tablet 768–1279px**: sidebar collassata a icone (64px), espandibile al click.
- **Mobile <768px**: sidebar nascosta, hamburger nell'header, sheet a scomparsa. Tabelle BOQ con scroll orizzontale + colonne essenziali; modali a tutto schermo.

**Cosa tocchiamo:**
- Nuovo `src/components/layout/AppShell.tsx` con `SidebarProvider`.
- Nuovo `src/components/layout/ProjectSidebar.tsx`.
- `ProjectDetail.tsx` passa da tab a `<Outlet/>` con sotto-route (`/projects/:id/boq`, `/gantt`, ecc.).
- Header compatto in `src/components/layout/AppHeader.tsx`.
- Audit `index.css` / `tailwind.config.ts` per breakpoint coerenti.

---

## Blocco 2 — Hardening tier & limiti server-side (sicurezza)

Oggi `useSubscriptionTier` legge da `localStorage` → un utente può cambiare tier da devtools e bypassare i limiti. Da rifare correttamente.

**Cosa cambiamo:**
- `useSubscriptionTier` legge da `organization_subscriptions` via Supabase, con React Query e cache.
- Aggiunto nuovo hook `useCurrentOrg()` (un utente può stare in più org → serve un selettore in header).
- **Enforcement storage pre-upload**: edge function `storage-quota-check` che, prima di firmare un upload, verifica `SUM(file size) < tier_storage_limit_bytes`. Calcolo via `storage.objects` filtrato per `organization_id`.
- **Cron daily** per `tick_subscription_lifecycle()` via pg_cron.
- RLS rafforzata: nuove policy che bloccano scritture su `project_items`, `project_tasks`, ecc. quando subscription è `suspended` o `purge_pending`.
- Rimosso lo switch tier "fake" da `SubscriptionTierPanel` per utenti non-admin globali.

---

## Blocco 3 — Account, organizzazioni, inviti (il giro che oggi è incompleto)

Oggi un utente loggato non sa "in quale org sta", e gli inviti non hanno un flusso end-to-end visibile.

**Cosa aggiungiamo:**
- **Org switcher** in header (avatar dropdown): mostra le org dell'utente, click per cambiare contesto attivo. Salvato in `localStorage` come ultima selezione.
- **Pagina "Members"** per owner org: lista membri, ruolo (etichette personalizzate via `organization_role_labels`), pulsanti "Invita" / "Rimuovi" / "Cambia ruolo".
- **Flusso invito**:
  1. Owner inserisce email + ruolo.
  2. Edge function `invite-member` crea utente in `auth.users` (se non esiste) via service role, crea riga in `organization_members` come pending, invia email con magic link.
  3. Nuovo utente atterra su `/accept-invite?token=...` → setta password → entra direttamente nell'org giusta.
- **Pagina "Profile"** unificata (`/profile`): avatar, nome, password, lingua, fuso orario, notifiche email on/off.
- **Pagina "Org Settings"** per owner: nome studio, logo, dominio custom, branding (colori PDF), etichette ruoli.
- **Audit log visibile**: nuova vista `/audit` per admin org (filtri per utente/entità/data), legge `audit_log`.

---

## Blocco 4 — Revisione feature-per-feature (audit ordinato)

Per ogni sezione facciamo: **(a) cosa esiste, (b) cosa è rotto/incompleto, (c) cosa fixiamo**. Andiamo in ordine, una sezione per turno, così il diff è leggibile e testabile.

Ordine proposto (ogni voce = un passaggio dedicato):

1. **Overview / Dashboard**
   - Fix KPI con dati reali (oggi alcuni mock).
   - Quick-filter "Waiting for me" funzionante anche cross-progetto.
   - Bottone "Crea progetto" rispetta `org_can_activate_project`.

2. **BOQ Analyst**
   - Sticky header verificato su tutti i breakpoint.
   - Bulk-edit (selezione multipla → cambio stato/responsabile in massa).
   - Bottone "Import Excel" con mapping colonne ricordato per org.
   - Filtri salvabili come "vista" per utente.

3. **Gantt & Tasks**
   - Rimozione definitiva di `GanttChart.tsx` legacy.
   - Drag per spostare task (oggi solo zoom/pan).
   - Dipendenze visibili con frecce sempre, non solo on-hover.
   - Export PNG/PDF della timeline.

4. **Approval Gate**
   - Unificare i 4 checklist button con stato "chi ha approvato cosa" sempre visibile.
   - Notifica automatica al ruolo successivo quando un gate è chiuso.

5. **Item Tracker** (Item Detail Modal)
   - Verifica lock tech fields post-firma (R+1).
   - Tab "Documents" con drag&drop reale, non solo selettore file.
   - Tab "Quotations": pulsante "Confronta" che apre `SupplierComparisonTool` con almeno 2 quote selezionate.

6. **Client Boards**
   - Firma cliente: aggiunta firma grafica (canvas) oltre alla checkbox.
   - Link condivisibile firmato (token JWT scadenza 30gg) per cliente che NON ha account → vede il board e firma.

7. **Supplier Docs**
   - "Invia RFQ" multi-fornitore in 1 click (selezione fornitori → email con link firmato → upload offerta).
   - Portale fornitore senza account su `/supplier-portal?token=...`.

8. **Presentation Builder**
   - Salvataggio auto ogni 30s.
   - Export PDF A3 con vera impaginazione (oggi è approssimativa).

9. **Chat / Messages**
   - Indicatore "sta scrivendo" via realtime channel.
   - Allegati visibili inline (immagini → preview, PDF → icona).

Ogni step include test manuale sui ruoli chiave (admin, PM, designer, client) prima di chiudere.

---

## Blocco 5 — Pulizia tecnica

Cose che non si vedono ma rendono l'app fragile:

- Rimuovere `GanttChart.tsx` e ogni import residuo.
- Centralizzare i toast in un wrapper (oggi mix di `sonner` e `use-toast`).
- Aggiungere `error.tsx` e `loading.tsx` per ogni route.
- Centralizzare email template (`supabase/functions/_shared/emails/`).
- Aggiungere almeno 5 test E2E base (login, crea progetto, crea item, approva, esporta).
- ESLint: alzare `no-explicit-any` a warning e ripulire i casi più gravi.

---

## Blocco 6 — Aggiornamento `PROJECT_SUMMARY.md`

A fine di ogni blocco aggiorniamo il documento riepilogativo con:
- Nuove rotte
- Nuove edge function
- Nuove tabelle/policy
- Changelog datato

---

## Come procediamo

Approvando questo piano, partiamo dal **Blocco 1 (sidebar + responsive)** perché:
- è il cambio più visibile e ti permette subito di "vedere" la differenza,
- è propedeutico a tutto il resto (le nuove pagine Account/Members/Audit del Blocco 3 vivono dentro la nuova shell).

Poi Blocco 2 (sicurezza tier) perché è invisibile ma critico, e da lì entriamo nel Blocco 4 sezione per sezione.

Se preferisci un ordine diverso (es. prima Blocco 3 inviti, o saltare subito a una sezione specifica del Blocco 4), dimmelo prima di iniziare l'implementazione.
