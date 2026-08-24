# Organigramma v3 — piano tecnico e wireframe (rev. 2)

Sostituisce integralmente la v2 (`/org-chart`, canvas React Flow). Include catalogo posizioni master, schede-appaltatore e interruttore permesso costi. Nessun codice in questo giro.

## 1. Posizionamento e accesso

- L'organigramma vive dentro la scheda **Organizzazione**, accanto a Members e Inviti: unica area "Organizzazione" con tre azioni per l'owner — **Organigramma + Invita + Gestisci membri**.
- Un membro semplice non ha accesso all'Admin Panel: per lui resta una vista **Organigramma in sola lettura** (stesso componente, senza pannello modifiche, senza elenco non assegnati, senza interruttori permessi), raggiungibile dal menu utente.
- Platform admin in View-as: eredita i diritti dell'owner via `useEffectiveOwner`, nessun gate ad hoc.
- La vecchia pagina React Flow (`src/pages/OrgChartPage.tsx`, ~666 righe) viene eliminata insieme alla dipendenza dal canvas.

## 2. Struttura dati

### Riuso dell'esistente

| Tabella | Uso in v3 |
|---|---|
| `org_positions` | nodo dell'albero: `title`, `user_id`, `team_id`, `manager_id`, `sort_order` |
| `teams` | squadra: `color` per la scheda, `discipline` per l'area |
| `team_members` | appartenenze multiple, `member_role='lead'` = caposquadra |
| `calendar_entries` | pallino di stato di oggi |
| `profiles` | nome, foto, email |
| `suppliers` | schede-appaltatore (flag `is_subcontractor` già presente) |
| `user_roles` | ruolo di default da cui deriva la visibilità costi |
| `org_chart_scope()` | filtro di visibilità server-side, già esistente |

### Aggiunte necessarie

1. `org_positions.node_kind text` (`person | team | unit | contractor`, default `person`) — distingue scheda-persona, scheda-squadra, macro-scheda area/dipartimento e scheda-appaltatore. Il contenimento nidificato usa `manager_id` come parent anche fra nodi non-persona: è così che nasce l'annidamento senza tabelle nuove.
2. `org_positions.supplier_id uuid references suppliers(id)` — popolato solo per `node_kind='contractor'`.
3. `team_members.is_primary boolean default false` — squadra primaria per il posizionamento visivo; indice unico parziale (un solo primario per utente/org). Le altre appartenenze restano badge secondari.
4. `profiles.phone text` — pannello di dettaglio; visibile solo ai membri della stessa organizzazione, stessa regola già in vigore per l'email.
5. **Catalogo posizioni master** `public.position_catalog`: `level` (L1_L2/L3/L4), `area`, `title`, `parent_title`, `is_lead`, `min_size` (small/medium/large), `sort_order`. Tabella globale in sola lettura per `authenticated`, popolata dal contenuto di `organigramma-master-kroneel.md` (C-suite completa incl. People/Marketing/Digital opzionali; L3 Finance/Operations/Creative con tutti i ruoli; L4 con le 10 squadre operative estese: edile, scavi & demolizioni, finiture, MEP con HVAC e antincendio, marmi, facciate & serramenti, isolamento, falegnameria & metalli, esterni & verde, logistica di cantiere).
6. `org_positions.catalog_id uuid null` + `title` libero — chi crea una posizione sceglie dal catalogo **oppure** scrive un titolo custom. Le aree/dipartimenti personalizzati (es. Legal per tender) sono semplici nodi `unit` con titolo libero: nessuna enum, nessun limite.
7. `public.cost_visibility_overrides (organization_id, user_id, can_see_costs boolean, set_by, set_at)` — override individuale sopra il ruolo. Scrivibile solo da owner/org admin; letta dalla funzione DB `can_see_costs()` che diventa: `override se presente, altrimenti ruolo`. Questo è il gancio che rende l'organigramma il punto di gestione del permesso, con enforcement reale in RLS.

`org_positions.x/y` (coordinate v2) restano in tabella ma non vengono più lette: il layout è derivato, non memorizzato.

### Ganci per il futuro (dati pronti, non implementati ora)

- `project_teams (project_id, team_id, phase/macro_area)` — assegnare una **squadra intera** a un progetto; i membri si derivano da `team_members` alla lettura, la squadra resta coesa.
- `project_contractors (project_id, supplier_id, macro_area)` — una scheda-appaltatore posizionata nell'organigramma di progetto alimenta il **Gantt** (badge EXT) e il **cost control** (costo di fase legato al fornitore) senza doppio inserimento.
- Entrambe sono singole tabelle di join: il modello §2 le rende additive, senza rifattorizzazioni.

### Rapporto con docs/plan-cost-visibility-hardening.md

Il piano costi resta valido e prioritario: l'override individuale è **inutile finché i costi non sono isolati**. Ordine corretto: prima la Fase 1-2 di quel piano (tabella `project_item_costs` + restrizione quotations/revisions), poi `cost_visibility_overrides` che si innesta nel predicato unico `can_see_costs()`. L'interruttore nell'organigramma viene realizzato in v3 ma il suo effetto è pieno solo dopo l'esecuzione di quel piano — lo dichiaro esplicitamente nell'UI ("permesso attivo, enforcement completo con l'hardening costi").

## 3. Resa a "scatole annidate"

Nessun canvas, nessun motore di layout: un albero HTML ricorsivo con CSS flex/grid.

- Query piatte in parallelo (posizioni visibili, teams, team_members, profili, stato di oggi), albero costruito in memoria con mappa `parent -> figli` e memoizzato.
- Componente ricorsivo `<OrgNode>` che si auto-renderizza per `node_kind`: `UnitBox` (area), `TeamBox` (squadra colorata), `PersonCard`, `ContractorCard`. La profondità **emerge dai dati**: 2 livelli per uno studio da 3 persone, 6+ per un developer da 5.000.
- La scheda-squadra usa `teams.color`: intestazione piena con il **caposquadra**, membri sotto in griglia responsive.

```text
┌─ AREA OPERATIONS ────────────────────────────────────────────────┐
│  ┌ Marco Rossi · COO ●┐                                          │
│                                                                  │
│  ┌─ SQUADRA MEP / IMPIANTI (verde) ─┐ ┌─ SQUADRA MARMI (ambra) ─┐│
│  │ ★ Ana Popa · Caposquadra      ●  │ │ ★ Ivo B. · Caposquadra ⊘││
│  │ ─────────────────────────────────│ │ ────────────────────────││
│  │ [f] Dan R.  ●   [f] Sara N.  ○   │ │ [f] Kim T.  ●           ││
│  │ Elettricista    Tecnico HVAC +2  │ │ Marmista                ││
│  └──────────────────────────────────┘ └─────────────────────────┘│
│                                                                  │
│  ┌─ APPALTATORE · Rossi Scavi Srl ──┐                            │
│  │ Scavi & demolizioni · EXT        │                            │
│  │ Ref. L. Rossi · 335 12 34 567    │                            │
│  └──────────────────────────────────┘                            │
└──────────────────────────────────────────────────────────────────┘

● verde = lavoro organizzato oggi (tooltip col nome progetto)
⊘ bianco barrato rosso = assente (ferie/permesso/malattia/festività)
○ grigio = nessun impegno registrato oggi
+2 = appartenenze secondarie ad altre squadre (badge, nessun duplicato)
★ = caposquadra, intestazione a colore pieno della squadra
```

Colonna laterale (solo per chi può modificare):

```text
┌ NON ASSEGNATI ────────┐   ┌ CATALOGO POSIZIONI ──────┐
│ [f] Elena V.          │   │ ▸ C-suite                │
│ [f] Omar S.           │   │ ▸ Finance / Operations   │
│ ▸ Squadra Finiture    │   │ ▸ Creative               │
│ ▸ Appaltatore: Vetri  │   │ ▸ Squadre operative (10) │
└───────────────────────┘   │ + Titolo custom…         │
                            └──────────────────────────┘
```

## 4. Interazione

- **Drag & drop** con `@dnd-kit` (leggero, ~10kb) da "Non assegnati" o dal catalogo verso una scheda-squadra o un'area. Il drop scrive una relazione (`team_members.team_id/is_primary` oppure `org_positions.manager_id`), mai coordinate. Optimistic update + invalidazione mirata.
- **Click su scheda-persona** → Sheet laterale: foto, nome, posizione, squadre (primaria + secondarie), stato di oggi col progetto; azioni **Chiama** (`tel:`), **Email** (`mailto:`), **Messaggio** (chat interna esistente), **Copia contatto**; e — solo per owner/admin — l'**interruttore "può vedere costi, prezzi e margini"** con indicazione del valore ereditato dal ruolo.
- **Click su scheda-appaltatore** → nome azienda, specialità, referente, contatti, link alla scheda fornitore.
- Ricerca per nome/ruolo, collasso/espansione per area, collasso di default oltre una certa profondità per le org grandi.

## 5. Performance rispetto a v2

| v2 | v3 |
|---|---|
| React Flow + canvas + nodi custom + calcolo posizioni | HTML/CSS ricorsivo, nessuna libreria di grafo |
| x/y persistite e riscritte a ogni drag | layout derivato, scritture solo su relazioni |
| molte query e re-render sul canvas | 5 query parallele, albero memoizzato |
| degrada oltre poche centinaia di nodi | rami collassati non montati, rendering per area |

Stato di oggi: **una** query su `calendar_entries` filtrata alla data corrente, mappata in memoria — zero query per scheda.

## 6. Permessi

- Lettura struttura: `org_chart_scope()` resta la fonte di verità (admin = tutta l'org; altrimenti sottoalbero proprio + linea di comando verso l'alto, attenuata e non modificabile).
- Modifica struttura: `can_edit` della RPC; l'owner/admin modifica tutto, il team lead solo la propria squadra e il proprio sottoalbero, il membro nulla.
- Contatti: telefono/email visibili solo nella stessa organizzazione.
- Interruttore costi: scrittura riservata a owner/org admin, con audit su `audit_log`; lettura effettiva dentro `can_see_costs()` in RLS, non solo lato UI.

## 7. Sequenza di lavoro

1. Migrazione DB: `node_kind`, `supplier_id`, `is_primary`, `profiles.phone`, `position_catalog` + seed, `cost_visibility_overrides` (con GRANT e RLS).
2. Estensione del seed per ogni nuova organizzazione con il catalogo master.
3. Hook unificato `useOrgChartV3` (albero + stato di oggi + override).
4. Componenti: `OrgTree`, `UnitBox`, `TeamBox`, `PersonCard`, `ContractorCard`, `UnassignedPanel`, `CatalogPanel`, `PersonDetailSheet`.
5. Integrazione nella scheda Organizzazione + vista read-only per i membri.
6. Drag & drop.
7. Rimozione di `OrgChartPage.tsx` e di React Flow; test di non regressione (View-as, visibilità per ruolo, multi-squadra senza duplicati, override costi).
8. **A seguire, sessione dedicata**: esecuzione di `docs/plan-cost-visibility-hardening.md` per rendere l'override pienamente enforced.
