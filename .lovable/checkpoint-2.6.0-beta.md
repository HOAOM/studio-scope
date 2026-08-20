# Checkpoint v2.6.0-beta

**Creato:** 20 agosto 2026 14:46 UTC  
**Predecessore:** v2.5.2  
**Scopo:** punto di ritorno stabile prima dell'applicazione dei 4 fix pianificati.

## Stato catturato

- Codice sorgente attuale dell'app Studio Scope (React + Vite + Lovable Cloud).
- Schema DB e Edge Functions nello stato precedente ai fix.
- Nessuna modifica ai 4 punti elencati sotto ancora applicata.

## Fix in coda da questo checkpoint

1. **RBAC a livello di UI** — nascondere voci di menu/sidebar/route non autorizzate; redirect silenzioso per URL diretti; fix `useUserRole` con filtro `organization_id`.
2. **Modale utenti super-admin** — ingrandire `OrgUsersDialog.tsx` per maggiore leggibilità.
3. **Pulsante "Segnala bug"** — rimuovere il floating button in basso a sinistra; lasciare la tabella `bug_reports` per futuro sistema ticket interno.
4. **Lentezza** — ottimizzare: lista membri (query parallele / evitare N+1), creazione utente (sostituire `listUsers` con lookup DB per evitare falsi negativi oltre 50 utenti), accettazione invito (ridurre round-trip).

## Come tornare indietro

Questo checkpoint è un marker statico. Per un ripristino effettivo del codice è necessario:
- ripristinare i file sorgente allo stato precedente tramite il versioning del progetto, oppure
- applicare manualmente i revert delle modifiche introdotte dopo questa data/ora.

Il file `VERSION` e questa nota identificano lo stato di riferimento.
