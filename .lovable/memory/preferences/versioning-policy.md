---
name: Versioning policy
description: Checkpoint 2.5.2 è lo stato di riferimento; ogni publish successivo incrementa la patch (2.5.3, 2.5.4...)
type: preference
---
Stato di riferimento: **v2.5.2** (`.lovable/checkpoint-2.5.2.md`, 23 ago 2026).

**Regola:** ogni pubblicazione futura incrementa la patch — 2.5.3, 2.5.4, ecc. Niente suffissi `-beta`.

**How to apply:** nello stesso turno del publish aggiornare
1. `VERSION`
2. nuova entry in cima a `CHANGELOG` in `src/lib/version.ts` (version, date ISO, summary, details)
