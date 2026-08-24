# Organigramma v3 — piano tecnico e wireframe

Sostituisce integralmente la v2 (`/org-chart`, canvas React Flow). Nessun codice in questo giro.

## 1. Posizionamento

- L'organigramma vive dentro la scheda **Organizzazione** (Admin Panel, tab `orgchart`), accanto a Members e Inviti — non più come pagina "personale" nel menu utente.
- Rotta `/org-chart` e voce nel menu avatar: rimosse (redirect verso la tab Organizzazione per non rompere i link).
- Nella stessa area, azioni contestuali in base ai permessi:
  - Owner / org admin (e platform admin in View-as, via `useEffectiveOwner`): Organigramma + Invita + Gestisci membri + modifica struttura.
  - Team lead: vede tutto, può modificare solo la propria squadra e il proprio sottoalbero.
  - Membro semplice: solo Organigramma in sola lettura (nessun pulsante invita/gestisci).

## 2. Modello dati — riuso, con due aggiunte

Riusiamo l'esistente:

| Tabella | Uso in v3 |
|---|---|
| `teams` | squadra; `color` per il colore della scheda-squadra, `discipline` per il raggruppamento di area |
| `team_members` | appartenenze (multi-squadra già supportata), `member_role = 'lead'` = caposquadra |
| `org_positions` | nodo gerarchico: `title`, `user_id`, `team_id`, `manager_id`, `sort_order` |
| `calendar_entries` | pallino di stato di oggi |
| `profiles` | nome, foto, email |
| `org_chart_scope()` | filtro server-side di visibilità (già esistente) |

Aggiunte necessarie (piccole, non distruttive):

1. `team_members.is_primary boolean not null default false` — squadra **primaria** per il posizionamento visivo. Le altre appartenenze diventano badge secondari sulla scheda, senza duplicare la persona nell'albero. Vincolo: al massimo una primaria per utente (indice unico parziale).
2. `org_positions.node_kind` (`person | team | unit`) — distingue schede-persona, schede-squadra e macro-schede di area/dipartimento. Il contenimento nidificato usa `manager_id` come "parent" anche fra nodi non-persona.
3. `profiles.phone` (o `org_positions.phone` se il telefono è aziendale e non personale) — serve al pannello di dettaglio. Da decidere: preferenza per `profiles.phone`, visibile solo ai membri della stessa org.

Campi diventati inutili: `org_positions.x` / `y` (coordinate del canvas v2). Restano in tabella ma non vengono più letti — il layout è calcolato dalla nidificazione, non memorizzato.

**Vincolo futuro (già coperto dai dati):** assegnare una squadra intera a un progetto richiederà solo una tabella `project_teams (project_id, team_id)`; i membri effettivi si derivano da `team_members` al momento della lettura, così la squadra resta coesa e nasce l'organigramma di cantiere. Non implementato ora, ma il modello sopra lo rende una singola tabella aggiuntiva.

## 3. Resa a "scatole annidate"

Nessun canvas, nessun motore di layout. Un solo albero HTML ricorsivo con CSS flex/grid:

- Una query piatta (`org_chart_scope` + teams + membri + stato di oggi), poi costruzione dell'albero in memoria con una mappa `parent -> figli`.
- Componente ricorsivo `<OrgNode>`: renderizza il proprio contenitore e mappa i figli. La **profondità emerge dai dati** — nessun livello fisso, funziona per 3 persone come per 5.000.
- La scheda-squadra è un contenitore colorato (`teams.color`) con il caposquadra come **intestazione** e i membri sotto in griglia responsive.

Wireframe:

```text
┌─ AREA: OPERATIONS ───────────────────────────────────────────┐
│  ┌─ [C] Marco Rossi · COO ──────────────────┐                │
│  └──────────────────────────────────────────┘                │
│                                                              │
│  ┌─ SQUADRA MONTAGGI (blu) ───────┐ ┌─ SQUADRA MEP (verde) ─┐│
│  │ ★ Luca Bianchi · Caposquadra ● │ │ ★ Ana Popa · Lead   ● ││
│  │ ───────────────────────────────│ │ ──────────────────────││
│  │ [foto] Sara N. ●   [foto] Ivo ⊘│ │ [foto] Dan R. ●       ││
│  │ Operaio            Operaio     │ │ Elettricista  +MEP2   ││
│  │ [foto] Kim T. ○                │ │                       ││
│  └────────────────────────────────┘ └───────────────────────┘│
└──────────────────────────────────────────────────────────────┘

● verde = lavoro organizzato oggi (tooltip: nome progetto)
⊘ bianco barrato rosso = assente (ferie/permesso/malattia/festività)
○ rosso = nessun impegno registrato oggi
+MEP2 = badge di appartenenza secondaria a un'altra squadra
★ = caposquadra (intestazione, colore pieno della squadra)
```

Colonna laterale destra, solo per chi può modificare:

```text
┌ NON ASSEGNATI ─────────┐
│ [foto] Elena V.        │  ← drag verso una scheda-squadra o un'area
│ [foto] Omar S.         │
│ ▸ Squadra Finiture     │  ← anche squadre intere trascinabili
└────────────────────────┘
```

## 4. Interazione

- **Drag & drop** con `@dnd-kit` (leggero) da "Non assegnati" verso una scheda-squadra o un'area; drop = update di `team_members` (con `is_primary`) o di `org_positions.manager_id`. Optimistic update + invalidazione mirata.
- **Click su scheda** → pannello di dettaglio laterale (Sheet): foto, nome, posizione, squadre, stato di oggi con progetto; azioni a costo zero: **Chiama** (`tel:`), **Email** (`mailto:`), **Messaggio** (apre la chat interna esistente `direct_messages`), **Copia contatto** (clipboard).
- Ricerca per nome/ruolo con evidenziazione, collasso/espansione per area, e per org molto grandi il collasso di default oltre una certa profondità.

## 5. Performance rispetto a v2

| v2 | v3 |
|---|---|
| React Flow + canvas + nodi custom + calcolo posizioni | HTML/CSS ricorsivo, zero librerie di grafo |
| Posizioni x/y persistite e riscritte a ogni drag | layout derivato, scritture solo su relazioni |
| N query + molti re-render sul canvas | 4 query in parallelo, memoizzazione dell'albero |
| Scarso oltre poche centinaia di nodi | schede-squadra collassate + rendering per area; solo il ramo aperto è montato |

Stato di oggi: una sola query su `calendar_entries` filtrata alla data corrente, indicizzata per utente, mappata in memoria — nessuna query per scheda.

## 6. Permessi

- Lettura: `org_chart_scope()` resta la fonte di verità (admin = tutta l'org; altrimenti sottoalbero proprio + linea di comando verso l'alto, in sola lettura attenuata).
- Scrittura: `can_edit` già restituito dalla RPC; la UI abilita drag & modifica solo dove è `true`. `useEffectiveOwner` copre il View-as senza gate ad-hoc.
- Il pannello di dettaglio mostra email/telefono solo a membri della stessa organizzazione (policy su `profiles` già in vigore per l'email; il telefono seguirà la stessa regola).

## 7. Sequenza di lavoro proposta

1. Migrazione DB (3 aggiunte del §2, con GRANT e policy).
2. Hook dati unificato `useOrgChartV3` (albero + stato di oggi).
3. Componenti: `OrgTree`, `UnitBox`, `TeamBox`, `PersonCard`, `UnassignedPanel`, `PersonDetailSheet`.
4. Integrazione nella tab Organizzazione + permessi.
5. Drag & drop.
6. Rimozione di `OrgChartPage.tsx`, rotta e voce di menu; test di non regressione (View-as, visibilità per ruolo, multi-squadra senza duplicati).
