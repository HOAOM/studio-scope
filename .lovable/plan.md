

# Piano Completo: War Room Dashboard + BOQ Analyst + Presentation Builder

## Panoramica

Il progetto attuale ha una buona base (War Room overview, project detail, CRUD items, CSV import, autenticazione). Serve completarlo con le funzionalita dei due file HTML che hai allegato e risolvere i problemi aperti per renderlo production-ready.

Dall'analisi dei file allegati:
- **BOQ v2.51**: Template per gestione BOQ con form per aggiunta item, statistiche live, filtri per categoria/area/status, admin mode con password, export JSON, supporto immagini 3D reference
- **HOA Presentation v2.2**: Builder di presentazioni A3 landscape con layout a griglia (header, 6 celle per immagini/testo), navigazione pagine, export PDF, import/export JSON

---

## Cosa verra implementato

### 1. Completamento War Room (fix e miglioramenti)

**KPI reali calcolati dagli item** -- attualmente lo status del progetto si basa solo sulle date. Verra calcolato dai dati reali:
- BOQ Completeness: % item con boq_included = true
- Item Approval Coverage: % item approvati
- Procurement Readiness: % item acquistati
- Delivery Risk: % item con data consegna passata e non ricevuti
- Installation Readiness: % item installati

**BOQ Coverage Matrix funzionante** -- collegata ai dati reali degli item (attualmente usa il vecchio mock type). Calcolata automaticamente raggruppando gli item per categoria.

### 2. BOQ Analyst integrato (dal file HTML allegato)

Una nuova tab/sezione nella project detail page con:
- **Statistiche live**: totale item, approvati, in BOQ, costo totale
- **Filtri avanzati**: per categoria, area, status, ricerca testo
- **Vista tabella completa** con tutte le colonne del BOQ (incluso supplier, PO ref, unit cost, quantity, total cost, production due, delivery date)
- **Image 3D Reference**: supporto per URL immagine con thumbnail nella tabella
- **Export dati**: esportazione in CSV/JSON degli item filtrati

### 3. Presentation Builder (dal file HTML allegato)

Una nuova pagina `/project/:projectId/presentation` con:
- **Pagine A3 landscape**: layout con header (progetto, logo placeholder) e griglia 2x3 per contenuti
- **Celle editabili**: ogni cella puo contenere un'immagine (URL) o testo formattato
- **Gestione pagine**: aggiungi, elimina, riordina pagine
- **Salvataggio nel database**: le presentazioni vengono salvate come JSON nella tabella dedicata
- **Export**: generazione PDF client-side con html2canvas + jsPDF

### 4. Database updates

Nuova tabella per le presentazioni:

```text
presentations
--------------
id              uuid (PK)
project_id      uuid (FK -> projects)
name            text
pages_data      jsonb        -- array di pagine con celle
created_at      timestamptz
updated_at      timestamptz
owner_id        uuid (FK -> auth.users)
```

RLS policies per `presentations` identiche al pattern esistente (is_project_owner).

### 5. Navigazione aggiornata

La project detail page avra un sistema a tab:
- **Overview**: sommario progetto + KPI + BOQ Coverage Matrix (esistente, migliorato)
- **Item Tracker**: tabella item completa con tutti i campi BOQ (esistente, espanso)
- **Presentation**: builder per presentazioni A3

---

## Dettaglio tecnico implementazione

### File da creare
| File | Scopo |
|------|-------|
| `src/components/warroom/PresentationBuilder.tsx` | Editor pagine A3 con griglia celle |
| `src/components/warroom/PresentationPage.tsx` | Singola pagina A3 con layout e celle editabili |
| `src/components/warroom/ExportButtons.tsx` | Componenti per export CSV/JSON/PDF |
| `src/components/warroom/ProjectKPIs.tsx` | KPI calcolati dinamicamente dagli item |
| `src/hooks/usePresentations.ts` | Hook React Query per CRUD presentazioni |

### File da modificare
| File | Modifiche |
|------|-----------|
| `src/pages/ProjectDetail.tsx` | Aggiunta sistema tab (Overview / Items / Presentation), KPI reali, BOQ matrix dai dati live |
| `src/pages/WarRoomOverview.tsx` | KPI reali per ogni progetto card (fetch items count per progetto) |
| `src/components/warroom/BOQMatrix.tsx` | Refactor per accettare items e calcolare coverage automaticamente |
| `src/components/warroom/ItemTracker.tsx` | Colonne aggiuntive (supplier, cost, quantity, total, 3D ref) |
| `src/hooks/useProjects.ts` | Aggiunta hook per fetch item counts aggregati per overview |
| `src/App.tsx` | Nuova route per presentation page |

### Migrazione database
- Creazione tabella `presentations` con RLS
- Trigger `updated_at` automatico

### Dipendenze esterne (gia nel progetto o via CDN)
- **jsPDF + html2canvas**: per export PDF delle presentazioni (importati come pacchetti npm)

---

## Cosa NON e incluso (fasi future)
- Reminder scadenze automatici (richiede edge function + cron)
- Report periodici via email
- Catalogo prodotti riutilizzabile
- L'admin mode con password del file BOQ originale (sostituito dal sistema auth esistente)

