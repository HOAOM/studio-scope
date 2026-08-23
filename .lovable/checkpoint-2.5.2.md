# Checkpoint v2.5.2

**Creato:** 23 agosto 2026 15:22 UTC
**Etichetta:** 2.5.2 (stato di riferimento stabile)

## Stato catturato

- Codice sorgente attuale di Studio Scope (React + Vite + Lovable Cloud).
- Schema DB, RLS e Edge Functions nello stato corrente (fix RBAC/View-as, gate password, sicurezza secfix1..18 applicati).
- Piano costi/margini pronto ma non applicato (`docs/plan-cost-visibility-hardening.md`).

## Convenzione di versioning da qui in avanti

- Ogni pubblicazione futura incrementa la patch: **2.5.3 → 2.5.4 → …**
- Aggiornare sempre, nello stesso turno del publish:
  1. `VERSION`
  2. la nuova entry in cima a `CHANGELOG` in `src/lib/version.ts`
- Nessun suffisso `-beta`: si usa la numerazione lineare.

## Come tornare indietro

Checkpoint statico: il ripristino avviene tramite il versioning del progetto Lovable
(riferimento temporale sopra) oppure con revert manuale delle modifiche successive.
