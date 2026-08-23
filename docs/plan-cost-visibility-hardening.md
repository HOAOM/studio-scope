# Piano — Isolamento dati costo/margine (BOQ, quotations, revisions)

Stato: **non applicato**. Da eseguire in sessione dedicata con test completi.

## Problema
1. `project_items` contiene i campi economici (`unit_cost`, `budget_unit_cost`, `budget_estimate`,
   `selling_price`, `margin_percentage`, `delivery_cost`, `installation_cost`, `insurance_cost`,
   `duty_cost`, `custom_cost`, `boxing_cost`, `shifting_cost`, `extra_safe_cost`) nella stessa riga
   dei dati descrittivi. La RLS di PostgREST è **per riga, non per colonna**: chiunque possa leggere
   l'item (inclusi ruoli `client` e `designer`) legge anche i costi.
2. `item_quotations` e `item_revisions` sono leggibili da ogni membro del progetto: quotazioni
   fornitore e snapshot con costi storici finiscono agli stessi ruoli.
3. `item_costs` è già ristretta correttamente e va usata come modello.

## Obiettivo
Nessun costo/prezzo/margine deve mai lasciare il DB verso ruoli `client` e `designer`
(salvo `selling_price` se in futuro serve al client board: decisione da prendere esplicitamente).

## Fase 1 — DB: tabella affiancata `project_item_costs`
- Nuova tabella `public.project_item_costs`:
  `project_item_id uuid PK REFERENCES project_items(id) ON DELETE CASCADE`,
  più tutte le colonne economiche sopra elencate, `updated_at`, `updated_by`.
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`, `GRANT ALL TO service_role`,
  nessun grant ad `anon`.
- RLS: SELECT/WRITE solo se `can_see_costs(auth.uid(), project_id)` (funzione già esistente,
  da estendere se necessario) — cioè ruoli interni: admin, ceo, coo, project_manager, qs,
  procurement_manager, accountant, head_of_payments (+ platform admin in impersonazione).
- Backfill: `INSERT ... SELECT` dei valori attuali da `project_items`.
- **Non droppare** le colonne originali nella stessa migrazione (regola side-by-side):
  restano in sola lettura per un ciclo, poi rimosse in una migrazione successiva di cleanup.
- Fino al drop, mitigazione immediata: vista `project_items_safe` senza colonne costo +
  revoca del `SELECT` colonnare sui campi costo di `project_items` per `authenticated`
  (`REVOKE SELECT (unit_cost, ...) ON public.project_items FROM authenticated`) — PostgREST
  rispetta i grant colonnari, quindi la protezione diventa effettiva senza attendere il drop.

## Fase 2 — DB: restringere quotations e revisions
- `item_quotations`: policy SELECT/INSERT/UPDATE/DELETE condizionate a `can_see_costs(...)`
  sul progetto dell'item (oggi: qualsiasi membro).
- `item_revisions`: lo `snapshot jsonb` contiene i costi. Due opzioni:
  a) restringere la SELECT ai ruoli interni (più semplice, preferita);
  b) sanificare lo snapshot nel trigger `log_item_change` e mantenere lettura ampia.
  Scelta consigliata: **(a)** + rimozione dei campi costo dallo snapshot per i nuovi record.
- `supplier_payments` e `item_costs`: verificare che la policy usi lo stesso predicato unico.

## Fase 3 — Frontend
- Nuovo hook `useItemCosts(projectId)` che legge `project_item_costs` e fa il merge in memoria
  con gli item, solo quando `canSeeCosts` è true.
- Aggiornare le scritture: `ItemDetailModal` (tab Accounting/Procurement), `ItemFormDialog`,
  `ExcelImportDialog`/`CSVImportDialog` (upsert su due tabelle in transazione logica),
  `BudgetOverview`, `BOQAnalyst`, `QuotationsTab`, `SupplierComparison`, export
  (`exportBOQExcel`, `exportClientQuotation`, `exportSupplierDocs`).
- Regola: nessun componente legge più `item.unit_cost` direttamente; passa da `costsById`.

## Fase 4 — Test
- Vitest: mapping merge costi + calcolo `Sale Price = (Subtotal + landed) * (1 + Margin%)` invariato.
- Test end-to-end manuale con account `designer@test.it` e `client@test.it`:
  network tab, verificare che la response BOQ non contenga chiavi di costo.
- Regressione su import Excel, generazione PO/RFQ/proforma e Client Board.

## Fase 5 — Cleanup (migrazione successiva)
- Drop delle colonne costo da `project_items` dopo una settimana di esercizio senza errori.
- Rilancio scan sicurezza e chiusura dei tre finding.

## Rischi
- Le query BOQ diventano due round-trip: mitigare con prefetch parallelo.
- L'import Excel scrive su due tabelle: serve gestione dell'errore parziale (idempotenza per item).
- Ogni punto del codice che fa `select('*')` su `project_items` va rivisto dopo il drop colonne.
