# Test beta end-to-end — Kroneel → Studio Scope

Obiettivo: percorrere l'intero flusso reale di un cliente nuovo, dal signup su kroneel.com fino al primo progetto dentro Studio Scope, e chiudere i punti che si rompono.

## Stato verificato oggi

- 7 organizzazioni, tutte con subscription `active` (1 business, 2 pro, 4 starter). Fra queste ci sono duplicati di test (`primo-test` e `primo-test-1`, `diag-test-0802`, `test3`).
- 20 utenti, di cui 3 con email non confermata. 19 membership, 8 progetti.
- `site-api` espone: `/organizations`, `/subscription/sync`, `/discount/validate`, `/discount/redeem`, `/referral/apply`, `/custom-domain`, `/domains`, `/domains/verify`, `/sso/ticket`, `/sso/redeem`.
- SSO: 4 ticket già generati, quindi il canale è stato esercitato almeno una volta.
- `organization_domains` è vuota: nessun dominio custom è mai stato registrato o verificato end-to-end.
- Email: 24 righe di log, 12 `sent` e 12 `pending`. Ogni `pending` ha un `sent` gemello a pochi secondi di distanza, senza `error_message`. Ultimo invio 3 agosto. Va confermato se i `pending` sono righe di enqueue che restano appese per design o residui non ripuliti — non è ancora diagnosticato.

## Fasi del test

### Fase 0 — Pulizia dati di prova
Rimuovere le organizzazioni palesemente di diagnostica (`primo-test-1`, `diag-test-0802`, `test3`, `studio-verifica-rls`) con i relativi membri, progetti e subscription, previa conferma esplicita di quali tenere. Confermare o cancellare i 3 utenti non confermati. Serve per non confondere i risultati del test con residui vecchi.

### Fase 1 — Signup pubblico
Da kroneel.com: registrazione nuovo cliente con tier Starter.
Verifiche: creazione utente, invio email di conferma dal dominio notify.kroneel.com, conferma, chiamata a `site-api/organizations`, creazione org + membership owner + subscription con tier corretto.

### Fase 2 — Codice sconto e referral
Applicare `KRONEEL100` in signup: `/discount/validate` deve accettarlo e `/discount/redeem` registrare la redemption. Ripetere lo stesso codice per confermare che il limite di utilizzo funzioni. Test analogo su `/referral/apply`.

### Fase 3 — SSO "Apri Studio Scope"
Dal pannello cliente su Kroneel: `/sso/ticket` genera il ticket, il redirect atterra su Studio Scope, `/sso/redeem` crea la sessione e l'utente entra già loggato nella sua org. Verificare che un ticket già consumato o scaduto venga rifiutato e finisca in `sso_redeem_failures`.

### Fase 4 — Primo uso reale nel software
Con l'utente appena creato: creazione progetto, verifica che i limiti di tier siano applicati (Starter = 2 progetti, il terzo deve essere bloccato), inserimento di alcuni item BOQ, avanzamento di uno di essi lungo il workflow, controllo che i costi restino nascosti ai ruoli Designer/Client.

### Fase 5 — Isolamento fra tenant
Con l'utente del nuovo tenant, tentare di leggere progetti e item di un'altra organizzazione. Nessun dato deve essere visibile. Verifica sia da UI sia da query diretta con il ruolo authenticated.

### Fase 6 — Email in scenari reali
Invito membro, recovery password, notifica messaggio interno. Per ciascuno controllare arrivo effettivo e stato finale nel log. Chiudere qui la diagnosi dei record `pending`.

### Fase 7 — Domini custom (parziale)
Registrare un dominio di test (`amz.ee` o `denardi.eu`) via `/domains`, verificare il record DNS e il passaggio a verificato via `/domains/verify`, e il tenant resolution via `GET /site-api/tenant?host=`. Il routing effettivo del traffico su quel dominio resta fuori portata finché si sta su hosting Lovable: si verifica solo la parte dati e resolution.

## Note tecniche

- Ogni fase produce un esito scritto: passato / rotto + causa. Non si passa alla fase successiva con una rotta aperta, salvo tua decisione.
- Le fasi 1–3 richiedono azioni tue sul sito Kroneel (progetto separato); io verifico lato Studio Scope stato DB, log edge function e log email dopo ogni tua azione.
- Le fasi 4–6 le posso guidare o eseguire in autonomia con un account di test.
- La fase 0 è distruttiva: la eseguo solo dopo tua conferma sull'elenco esatto.
