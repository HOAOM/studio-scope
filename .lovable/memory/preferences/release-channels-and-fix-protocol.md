---
name: Canali di rilascio e protocollo dei fix
description: Frontend live solo dopo publish; ogni fix va dichiarato per canale (db/edge/frontend) con verifica reale
type: preference
---
Nel progetto ci sono tre canali con tempi diversi: **DB/migrazioni** ed **edge functions** sono live subito dopo l'applicazione/deploy; tutto `src/**` è live **solo dopo un publish esplicito**.

**Regola**: mai dichiarare "fatto" un fix frontend prima del publish. Chiudere ogni intervento con una riga per canale:

```text
[db]       ... — live, verificata con query
[edge]     ... — deployata, live
[frontend] ... — nel codice, LIVE SOLO DOPO PUBLISH
```

Verifica corretta per canale: DB → query sullo stato reale; edge → chiamata reale alla funzione; frontend → typecheck + publish (o dichiarazione esplicita che serve il publish dell'utente).

**Anti-regressione**: prima di chiudere un fix che tocca workflow, ruoli, limiti di piano o inviti, eseguire `bunx vitest run` (test in `src/test/`).

**Token**: preferire blocchi di lavoro chiusi (più fix nello stesso turno + typecheck + publish) invece di turni corti in serie. Quando la direzione è concordata, diagnosi e fix vanno nello stesso turno.

**Migrazioni**: non creare più edge function `run-migration-*`. Usare lo strumento di migrazione nativo; lo storico delle 43 vecchie è archiviato in `docs/db-history/*.sql` e non va rieseguito.
