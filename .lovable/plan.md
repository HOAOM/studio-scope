# Prossimi passi — beta test, ripresa dalla Fase 1

## Dove siamo (verificato ora sul database)

- Pulizia completata: resta **1 sola organizzazione**, `studio-scope` (tier business, subscription attiva), con 8 progetti e 13 membership.
- 20 utenti in auth, di cui 3 con email mai confermata (residui vecchi, non legati ad alcuna org attiva).
- `organization_domains` vuota, 0 riscatti di codici sconto, 1 ticket SSO storico e 2 fallimenti di redeem registrati.
- Log email: 12 `sent` e 12 `pending`, ultimo invio 3 agosto. I `pending` non sono ancora stati diagnosticati.

## Cosa facciamo, in ordine

### Passo A — Signup reale da kroneel.com (Fase 1)
Tu fai una registrazione vera dal sito, tier Starter, con un indirizzo email che puoi aprire.
Io controllo subito dopo: utente creato, email di conferma partita da notify.kroneel.com, organizzazione + membership owner + subscription creati con il tier giusto. Se qualcosa non arriva, guardo i log della funzione e ti dico cosa manca.

### Passo B — Codice sconto e referral (Fase 2)
Ripeti un signup usando `KRONEEL100`. Verifico che la validazione passi, che la redemption venga registrata e che al secondo uso oltre il limite venga rifiutata. Stesso controllo sul referral.

### Passo C — SSO "Apri Studio Scope" (Fase 3)
Dal pannello cliente su Kroneel premi il bottone. Verifico che il ticket venga generato, consumato una sola volta, e che l'utente atterri già loggato nella sua organizzazione. Controllo anche che un ticket riusato finisca fra i fallimenti invece di creare sessione.

### Passo D — Primo uso reale nel software (Fase 4)
Con l'utente nuovo: creo/creiamo un progetto, verifico che il limite Starter di 2 progetti blocchi il terzo, inserisco qualche voce BOQ, avanzo un item nel workflow e controllo che costi e margini restino invisibili ai ruoli Designer e Client.

### Passo E — Isolamento fra tenant (Fase 5)
Dal nuovo tenant provo a leggere progetti e item di Studio Scope: non deve comparire nulla, né da interfaccia né da query diretta.

### Passo F — Email negli scenari reali (Fase 6)
Invito membro, recupero password, notifica messaggio interno: per ognuno verifico l'arrivo e lo stato finale. Qui chiudo anche la diagnosi dei 12 record `pending`.

### Passo G — Pulizia finale utenti orfani
Se il test va a buon fine, cancello i 3 utenti mai confermati e gli account auth rimasti senza organizzazione, così l'ambiente resta pulito per i clienti reali.

## Note tecniche

- I passi A, B e C richiedono azioni tue sul sito Kroneel (progetto separato): io verifico lato Studio Scope stato database, log edge function `site-api` e log email dopo ogni tua azione.
- I passi D, E, F posso eseguirli in autonomia una volta esistente l'utente di test.
- Il routing effettivo dei domini custom resta fuori portata su hosting Lovable: la Fase 7 la teniamo sospesa fino al passaggio su VPS.
- Nessuna cancellazione viene eseguita senza tua conferma esplicita sull'elenco esatto.

## Se preferisci non passare dal sito

Posso simulare i passi A–C chiamando direttamente gli endpoint `site-api` con la chiave server: il flusso dati viene verificato lo stesso, ma non copre l'interfaccia di kroneel.com. Dimmi quale delle due strade preferisci.
