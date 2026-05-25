# Brief non-tecnico — Cosa stiamo per costruire

Prima di mettere mano al codice, ecco in parole semplici **cosa cambia nel software** dopo le 6 fasi. Niente termini tecnici: solo cosa vedrai tu, cosa vedranno i tuoi clienti, e perché serve.

---

## Il punto di partenza

Oggi Studio Scope è **un'unica casa condivisa**: tutti gli utenti vedono tutto, esiste un solo "studio". Va benissimo per la beta interna, ma non possiamo venderlo a clienti esterni così — finirebbero per vedersi i dati a vicenda.

L'obiettivo delle 6 fasi è trasformare il software in un **condominio**: ogni studio cliente ha il suo appartamento privato, con la sua porta, le sue chiavi, il suo abbonamento. Tu (proprietario del palazzo) hai le chiavi master e vedi tutto dall'alto.

---

## FASE 1 — Creiamo gli "appartamenti separati"

**Cosa cambia per te:** nulla di visibile. Lavoro di fondamenta invisibile.

**Cosa facciamo dietro le quinte:** introduciamo il concetto di "Organizzazione" (= studio cliente). Ogni utente d'ora in poi appartiene a un'organizzazione, ogni progetto appartiene a un'organizzazione. I dati esistenti li mettiamo tutti in un'organizzazione di default chiamata "Studio Scope" così non si rompe nulla.

**Perché serve:** è la base. Senza questo, tutte le fasi successive non funzionano. È come gettare le fondamenta di un palazzo prima di costruire i piani.

---

## FASE 2 — Il "semaforo" dell'abbonamento

**Cosa cambia per te:** vedrai un pannello "Stato abbonamento" per ogni cliente. Verde = paga, giallo = in ritardo, rosso = bloccato, nero = dati cancellati.

**Cosa cambia per il cliente:** se smette di pagare, il software entra in **modalità protezione**:
- Per i primi giorni di ritardo: avviso giallo "rinnova entro X giorni"
- Scaduto il termine (15 giorni Base / 30 Pro / 90 Business): accesso bloccato, schermata "Pagamento sospeso — riprendi qui"
- Scaduta la finestra di conservazione: dati cancellati dal sistema attivo (ma noi ne teniamo una copia sul NAS, recuperabile a pagamento)

**Perché serve:** è il meccanismo che protegge il tuo fatturato. Senza pagamento, niente accesso. Senza ambiguità.

---

## FASE 3 — Rinominare i ruoli (ma non inventarli)

**Cosa cambia per il cliente:** nell'area admin del suo studio, può rinominare i ruoli a piacere. Esempio: "Project Manager" diventa "Andrew", "COO" diventa "Marco". Le **funzioni e i permessi restano fissi** — cambia solo l'etichetta che lui vede.

**Cosa NON può fare il cliente:** creare ruoli nuovi. Se potesse, comprerebbe il piano Base e poi creerebbe 50 ruoli per non pagare il Pro. Blindato.

**Cosa puoi fare solo tu:** in futuro, aggiungere ruoli nuovi al sistema (lato codice).

**Perché serve:** personalizzazione per il cliente senza aprire una falla nel modello a tier.

---

## FASE 4 — Progetti attivi vs archiviati

**Cosa cambia per il cliente:** ogni progetto ha un pulsante "Archivia". Un progetto archiviato:
- Resta consultabile in sola lettura
- Non conta nel limite dei progetti attivi del suo tier
- Non si possono più modificare items, costi, gantt

Limiti per tier (sui soli **attivi**):
- **Starter**: 2 progetti attivi
- **Pro**: 8 progetti attivi
- **Business**: illimitati

**Anti-furbetti:** riaprire un progetto archiviato consuma uno slot attivo. Se uno fa più di 2 riaperture al mese, deve comprare un addon. Così evitiamo che "studio business infiniti progetti" archivi e riapra a ciclo continuo per restare nel piano Base.

**Perché serve:** è il principale vincolo commerciale che differenzia i tier.

---

## FASE 5 — Programma referral + codici sconto

**Cosa cambia per chiunque (anche senza abbonamento):**
- Ha un codice referral personale e un link condivisibile
- Vede in dashboard quanti clienti ha portato e quanto ha guadagnato
- Riceve 10% su ogni pagamento andato a buon fine del cliente portato

**Cosa puoi fare tu (admin globale):**
- Creare codici sconto generici (es. -20% per 3 mesi)
- Creare codici sconto **accesso totale gratuito** (per i primi clienti chiave / influencer)
- Vedere il pannello commissioni e marcare i pagamenti come "pagati"

**Perché serve:** è il motore di crescita organica nei primi 6-12 mesi, prima di investire in adv.

---

## FASE 6 — La "porta sul retro" per il sito esterno

**Cosa cambia per te:** ti consegno un documento tecnico (`SITE_INTEGRATION_API.md`) da dare al web expert che farà il sito. Dentro c'è la lista di "chiamate" che il sito potrà fare al software, con esempi:
- "Crea una nuova organizzazione per questo cliente che ha appena pagato"
- "Verifica se questo codice sconto è valido"
- "Aggiorna lo stato abbonamento perché Stripe dice che è stato pagato"
- "Registra questo dominio custom per lo studio X"

**Cosa cambia per il cliente finale:** l'onboarding (registrazione, scelta tier, pagamento, scelta dominio) avviene **sul sito**, non nel software. Quando finisce, viene loggato direttamente nel suo "appartamento" già configurato.

**Perché serve:** è il ponte tra il sito di vendita (che farà l'esperto) e il software (che gestisci tu). Senza questo, il sito non può "creare" clienti.

---

## Tempi e modalità

Procediamo **una fase alla volta**. Dopo ogni fase ti chiedo conferma, verifichi che nulla si sia rotto e si va alla successiva. Stimato:

- Fase 1: ~1 sessione (fondamenta)
- Fase 2: ~1 sessione (semaforo + cron)
- Fase 3: ~1 sessione (etichette ruoli)
- Fase 4: ~1 sessione (archivio + limiti)
- Fase 5: ~2 sessioni (referral + codici sconto sono ricchi)
- Fase 6: ~1 sessione (solo edge functions + doc)

**Totale: ~7 sessioni di lavoro.** Nessuna funzionalità esistente viene rimossa o stravolta. Si aggiungono solo strati nuovi.

---

## Due cose da decidere ora (prima di Fase 1)

1. **Nome dell'organizzazione di default** in cui metto tutti gli utenti e progetti esistenti: ti propongo **"Studio Scope"**. Va bene o preferisci un altro nome (es. il nome del tuo studio reale)?

2. **Stripe vs Paddle vs nessuno per ora**: in Fase 2 prevedo i campi `stripe_customer_id` ma lascio lo switch manuale (tu cambi tier dal pannello admin) finché il sito non è pronto. Confermi questa scelta o vuoi già collegare Stripe?

Confermando queste due cose parto subito con Fase 1.
