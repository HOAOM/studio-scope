
# Piano riorganizzazione StudioScope — linguaggio semplice

## 1. VPS vs Lovable — la spiegazione che ti serve

Hosting = il "computer sempre acceso" su cui gira il tuo software.

**Hosting Lovable (consigliato per partire)**
- Pro: zero manutenzione, backup automatici, sicurezza gestita, scala da sola se domani hai 100 studi, certificato HTTPS automatico, aggiornamenti istantanei quando modifichi qualcosa qui in chat.
- Contro: paghi un canone Lovable mensile (cresce col traffico), il codice "vive" sui loro server.
- Costo realistico fase beta: 0-50€/mese.

**VPS tua (es. quella su cui gira amz.ee)**
- Pro: controllo totale, canone fisso basso (5-20€/mese), dati fisicamente tuoi.
- Contro: TU sei sysadmin. Significa: configurare server, database PostgreSQL, certificati SSL che scadono, backup, patch di sicurezza ogni settimana, monitoraggio uptime. Se cade alle 23:00 di sabato, lo ripari tu. E ogni modifica fatta qui in Lovable va esportata e ri-deployata a mano.
- In fase di lancio commerciale è un freno enorme: stai vendendo a studi che si aspettano affidabilità, non puoi permetterti downtime mentre impari ad amministrare un server.

**Raccomandazione concreta**: usa **amz.ee puntato all'hosting Lovable** per il test. Zero lavoro di sistemistica, dominio tuo, fra 6 mesi quando hai 20 clienti paganti decidiamo se spostare. Lo spostamento futuro è possibile ma costoso — non è una decisione da prendere ora.

---

## 2. Architettura: due progetti, un unico database utenti

```text
amz.ee  (Progetto A — Sito vendita)        app.amz.ee  (Progetto B — Software)
┌─────────────────────────────┐             ┌──────────────────────────────┐
│ Landing pubblica            │             │ Login dello studio           │
│ Pagina pricing (3 tier)     │             │ Dashboard progetti           │
│ Scelta addon                │             │ BOQ / Gantt / Procurement    │
│ Checkout (Stripe/Paddle)    │ ─ stesso ─► │ Onboarding wizard            │
│ Form contatto enterprise    │   database  │ Gestione utenti & ruoli      │
│ Blog / Help center          │             │ Moduli addon attivati        │
└─────────────────────────────┘             └──────────────────────────────┘
```

**Flusso utente unico**:
1. Lo studio arriva su `amz.ee` → sceglie tier + addon → paga
2. Pagamento conferma → si crea automaticamente lo "spazio" dello studio nel database
3. Riceve email con link a `app.amz.ee` per il primo accesso
4. Onboarding: nome studio, logo, colori → invita utenti e assegna ruoli
5. Da quel momento usa solo `app.amz.ee`

I due progetti condividono **lo stesso backend Lovable Cloud** (un solo database utenti, abbonamenti, ecc.). Modificare uno non rompe l'altro.

---

## 3. Modello commerciale — 3 tier + addon

**Tier base (prezzi da rivedere insieme, queste sono ipotesi)**

| | Studio Starter ~29€/mese | Studio Pro ~89€/mese | Studio Business ~199€/mese |
|---|---|---|---|
| Progetti attivi | 2 | 10 | 30 |
| Utenti totali | 3 | 10 | 25 |
| BOQ + Gantt + Procurement | ✓ | ✓ | ✓ |
| Branding custom (logo + nome) | ✓ | ✓ | ✓ |
| Onboarding & training | ✓ | ✓ | ✓ |
| Import Excel massivo | — | ✓ | ✓ |
| Audit log esteso | 30gg | 12 mesi | illimitato |
| Supporto | email | email prioritaria | dedicato |

**Addon a pagamento (attivabili da chiunque, indipendenti dal tier)**

| Addon | Prezzo ipotesi | Cosa fa |
|---|---|---|
| Client Boards | 19€/mese | Tavole A3 firmate dal cliente |
| Presentation Builder | 19€/mese | Slide builder con accept/reject diretto |
| Supplier Exports | 19€/mese | RFQ, PO, Proforma PDF+Excel |
| Progetto extra | 8€/mese cad. | Sblocca 1 progetto oltre il limite del tier |
| Utente extra | 12€/mese cad. | Sblocca 1 utente oltre il limite |
| Modulo Taglio Marmi | 39€/mese | (da costruire) |
| Modulo Piano Installazione Piastrelle | 39€/mese | (da costruire) |
| Onboarding & Training Pro | 490€ una tantum | Sessione 1:1 con te |

Vantaggio chiave: **clienti che oggi non userebbero Client Boards/Presentation pagano meno** e tu monetizzi di più chi le usa davvero. Aggiungere un nuovo modulo (es. "Piani luce") in futuro = nuovo addon, zero impatto sui clienti esistenti.

---

## 4. Versioning automatico — risolto

Da subito, ogni modifica fatta qui bumperà la versione (2.5.0 → 2.5.1 → 2.5.2 …) e aggiornerà un mini-changelog visibile nel pannello admin. Vedi versione in alto a destra, clicchi e leggi cosa è cambiato e quando.

Funziona così:
- File `src/lib/version.ts` aggiornato ad ogni mio cambio
- Tabella `changelog` nel database con: versione, data, sintesi modifica, autore
- Pannello admin "Cronologia versioni" per consultarla
- Te lo metto nei prossimi cambiamenti come prima cosa, indipendentemente dal resto del piano

---

## 5. Test interno con account finti — come lo facciamo bene

Già hai 11 account `*@test.it` (password `Def@ult01`). Costruiamo un **kit di test scenario** che simula 4 settimane di vita di un progetto reale in 1 ora:

1. **Seed automatico**: pulsante "Crea progetto demo completo" che genera 1 progetto con 200 item finti, 50 quotazioni, 30 task Gantt, milestone, board firmate, presentation.
2. **Checklist scenari critici** (PDF stampabile):
   - Signup studio nuovo → onboarding → primo progetto
   - Designer crea item → Senior approva → HoD approva → Client firma board
   - Procurement riceve 3 quotazioni → accetta una → genera PO → registra pagamenti
   - Gantt: task in ritardo → notifica → riassegnazione
   - Tentativo di violare i limiti del tier (creare 4° progetto con tier Starter)
   - Test isolamento: studio A non deve mai vedere dati studio B
3. **Bug tracker integrato**: pulsante "Segnala bug" in basso a destra che apre form e salva su tabella `bug_reports` con screenshot automatico.

Lo facciamo dopo aver completato l'isolamento multi-studio (è il prerequisito assoluto).

---

## 6. Ordine operativo proposto (8 settimane realistiche)

| Sett. | Cosa | Perché ora |
|---|---|---|
| 1 | Versioning + changelog + isolamento multi-studio (Fase 1 già avviata) | Senza isolamento non puoi mostrare a 2 studi |
| 2 | Architettura addon dinamica (sistema feature flag) + spostare Client Boards/Presentation/Supplier Exports come addon | Cambia il modello commerciale, va fatto prima dei prezzi |
| 3 | Progetto B (software) finito + bug tracker + seed demo + kit test scenario | Test interno serio |
| 4 | Test interno intensivo con i 11 account, fix bug, performance | Quality gate |
| 5 | Progetto A (sito vendita amz.ee): landing, pricing, checkout Stripe/Paddle | Solo dopo che il software è solido |
| 6 | Onboarding post-pagamento (creazione studio automatica) + email branded | Esperienza professionale |
| 7 | White-label per-studio (logo, colori in PDF e UI) + admin panel finale | Differenziatore commerciale |
| 8 | Dominio amz.ee + app.amz.ee live, monitoring, primi 3 studi reali invitati | Soft launch controllato |

---

## 7. Cosa NON faremo in questo piano

- Spostamento su VPS (rimandato a quando ha senso economico)
- Moduli Taglio Marmi e Piastrelle implementati (solo skeleton + addon attivabile, li costruisci dopo il lancio)
- Mobile app nativa (la web app è già usabile da mobile)
- Integrazioni Revit/AutoCAD avanzate

---

## 8. Domande aperte che decideremo strada facendo

- Prezzi esatti dei 3 tier e degli addon (oggi sono ipotesi, li tariamo dopo i primi feedback)
- Provider pagamenti definitivo (Stripe seamless vs Paddle — decidiamo in settimana 5 con dati alla mano)
- Se l'onboarding 1:1 a 490€ è davvero opzionale o lo regaliamo ai primi 10 studi

---

## Sezione tecnica (puoi saltarla)

- Bump versione: pre-commit hook + tabella `app_versions(version, label, summary, released_at)`.
- Multi-tenancy: tabella `organizations` + `organization_members` (già creata in Fase 1.1), aggiunta colonna `organization_id` su `projects`, `suppliers`, `company_settings`, `client_boards`, `presentations`, `*_documents`. RLS riscritta con `is_org_member()`.
- Addon: registry `src/lib/featureModules.ts`, gate `useFeature('client_boards')` letto da `organization_subscriptions.addons` jsonb.
- Sito vendita: secondo progetto Lovable che usa lo stesso Supabase project ref via API key dedicata, scrive su `organizations` e `organization_subscriptions` post-webhook pagamento.
- Dominio: amz.ee A-record → Lovable (Progetto A), app.amz.ee CNAME → Lovable (Progetto B).
- Test: edge function `seed-demo-project` invocabile da admin; tabella `bug_reports` con upload screenshot via storage bucket.

---

**Quando approvi questo piano**, parto da: (1) sistema di versioning automatico, (2) completamento isolamento multi-studio già iniziato in Fase 1.1. Niente sito vendita né addon finché il software non è multi-studio sicuro — è il prerequisito di tutto il resto.
