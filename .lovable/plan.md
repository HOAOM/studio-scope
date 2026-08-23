# Metodo di lavoro: fix reali, meno token sprecati

Non un elenco di buone pratiche generiche: sotto ci sono i problemi misurati su questo progetto e cosa cambiare, in ordine di impatto.

## Cosa ho misurato adesso

- 59 edge functions, di cui **43 sono `run-migration-*` usa-e-getta** più 5 `run-*-tests`. Sono codice morto che resta nel repo, nel contesto e negli elenchi file di ogni turno.
- **Nessun test reale**: `src/test/example.test.ts` contiene solo `expect(true).toBe(true)`. Non esiste alcuna rete che segnali "ho aggiustato una cosa e ne ho rotte tre".
- File enormi che vengono riletti a ogni modifica: `ItemDetailModal.tsx` 1639 righe, `BOQAnalyst.tsx` 1033, `ProjectDetail.tsx` 944, `ItemFormDialog.tsx` 903, `workflow.ts` 831, più `types.ts` 3575 (autogenerato).
- `PROJECT_SUMMARY.md` è a 276 righe ma non contiene una sezione su publish/deploy: manca proprio la parte che ha causato l'errore di ieri.

## Perché ti ho detto "sistemato" e non lo era

Causa esatta, non generica: nel progetto ci sono **due canali di rilascio con tempi diversi**.

```text
Edge function / migrazione DB  ->  attiva subito dopo il deploy
Codice React (src/**)          ->  attivo solo dopo un publish esplicito
```

Il fix del Bug 1 toccava `AcceptInvite.tsx` (frontend). Era corretto nel codice, ma il dominio pubblico serviva ancora il build precedente. Io ho dichiarato "fatto" basandomi sullo stato del repo, tu hai testato la produzione: due verità diverse, entrambe reali.

**Regola da adottare**: un fix che tocca `src/**` non è mai "fatto" finché non è pubblicato. Nel messaggio finale dichiaro sempre, per ogni fix, il canale (`DB` / `edge` / `frontend`) e se è già live o attende publish.

## Le 4 regole operative da adottare

### 1. Definizione di "fatto"
Ogni fix si chiude con una riga secca in questo formato:

```text
[frontend] AcceptInvite gate password — nel codice, LIVE SOLO DOPO PUBLISH
[edge]     invite-member orgSiteUrl   — deployato, live ora
[db]       policy user_roles          — migrata, live ora, verificata con query
```

Niente "fatto tutto". Se una parte non è verificabile senza di te, lo scrivo invece di presumerla.

### 2. Verifica prima di dichiarare, ma la verifica giusta
- fix DB → una query che mostra il nuovo stato (policy, riga, grant);
- fix edge function → una chiamata reale alla funzione;
- fix frontend → typecheck **più** publish, oppure dichiarazione esplicita che serve il tuo publish.

Costa pochi token, evita i giri a vuoto che ne costano molti di più.

### 3. Blocchi di lavoro chiusi, non a rate
Il consumo alto viene soprattutto dai turni corti in serie: ogni turno ricarica contesto. Meglio pochi messaggi con più lavoro dentro: "questi 3 fix, applicali tutti, poi typecheck e publish" costa molto meno di 3 messaggi separati.

Nella stessa logica: quando servono diagnosi + fix e sei d'accordo sulla direzione, dammi il via libera a fare entrambi nello stesso turno anziché diagnosi in un turno e fix nel successivo.

### 4. Regressioni: rete minima, non suite completa
Non serve coprire tutto. Servono test sui punti che si sono già rotti più volte: workflow degli stati, calcolo margine/landed cost, limiti di tier, derivazione dominio invito.

## Pulizia strutturale proposta (una tantum)

Questi tre interventi riducono il costo di ogni turno futuro, in modo permanente.

**A. Archiviare le 43 `run-migration-*` e le 5 `run-*-tests`**
Sono già state eseguite. Il loro SQL va conservato come file in `supabase/migrations/` (storico leggibile), le cartelle function vanno rimosse dal repo e le funzioni cancellate dal backend. Nessun dato toccato: sono script già applicati. Da qui in avanti le migrazioni passano dallo strumento di migrazione nativo, non da edge function usa-e-getta.

**B. Spezzare i 4 file monstre**
`ItemDetailModal.tsx` in un file per tab, `BOQAnalyst.tsx` separando tabella/filtri/toolbar, `ProjectDetail.tsx` separando i tab, `ItemFormDialog.tsx` per sezioni. Puro refactor, nessun cambio di comportamento. Effetto: una modifica a un tab non mi obbliga più a leggere e riscrivere 1600 righe.

**C. Rete di test minima (circa 15-20 test)**
`workflow.ts` (transizioni ammesse per ruolo), calcolo prezzo di vendita, `tierLimits.ts`, `orgSiteUrl.ts` (priorità custom_domain → slug → origin). Girano in secondi e mi dicono subito se un fix ne ha rotto un altro.

**D. `PROJECT_SUMMARY.md`: aggiungere la sezione mancante**
Una tabella "cosa è live dove": canale di rilascio, dominio, cosa richiede publish, quali domini sono in allow-list dei redirect. È l'informazione che ieri mancava e che ha prodotto la dichiarazione sbagliata.

## Ordine consigliato

1. D (5 minuti, evita subito il ripetersi dell'errore)
2. A (pulizia, riduce il rumore di ogni turno)
3. C (rete anti-regressione)
4. B (refactor, il più lungo — fattibile un file per volta)

## Cosa mi serve da te

- Conferma su A: le `run-migration-*` sono tutte già applicate e archiviabili?
- Vuoi che B parta subito o solo quando toccheremo quei file per altri motivi?
