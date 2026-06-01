## Obiettivo

Un sito vetrina cinematografico (scrollytelling stile Apple/Porsche/A24) che vende il software, con onboarding completo nel sito: il cliente scrolla, sceglie il tier, sceglie come usare il dominio, e si ritrova lo spazio già pronto — senza tuo intervento manuale. Più referral e codici sconto.

## Premessa onesta sull'architettura (da decidere prima di costruire)

Le tue tre richieste — **isolamento massimo + automazione totale + hosting autonomo su tua VPS** — al massimo grado non coesistono senza un grosso progetto infrastrutturale separato. Ecco perché, senza giri di parole:

- **Isolamento fisico per cliente** (un database/istanza separata per ognuno) dà il massimo isolamento, ma per essere **automatico** richiede un orchestratore (container/DB creati al volo, routing dei domini, backup, aggiornamenti su N istanze). Questo **non è un'app**: è infrastruttura DevOps che Lovable **non genera e non deploya**. Su una VPS auto-gestita andrebbe costruita e mantenuta da te/un sysadmin.
- **Hosting su tua VPS**: questa app gira su Lovable Cloud (frontend Lovable + backend gestito Supabase). Non è un pacchetto "carico sulla VPS e parte". Esportarla in self-hosting è possibile in teoria ma è un altro progetto, e perde gli automatismi di Lovable.

### La strada realistica (consigliata) — SaaS multi-tenant
Ottiene **esattamente** il tuo obiettivo pratico ("nessun rischio di mescolamento dati" + "zero intervento manuale"), che è ciò che il software **già implementa**:

- Un'unica app, un unico database. I clienti sono isolati **logicamente** da `organization_id` + Row-Level Security: un cliente non può tecnicamente vedere i dati di un altro. Questo è lo standard dei SaaS seri.
- Il provisioning è **già automatizzabile**: esiste la edge function `site-api` che crea org + utente owner + abbonamento, applica referral e sconti, e registra il dominio. Niente intervento manuale.
- I domini cliente funzionano così: dominio proprio (custom domain), oppure sottodominio `cliente.tuosoftware.com`, entrambi puntano alla stessa app che riconosce l'org dal dominio.

> Raccomando questa strada. Il piano qui sotto la assume. Se invece vuoi davvero l'isolamento fisico per cliente, va prima impostato un progetto infrastrutturale a parte (fuori Lovable) e il sito si limiterebbe a "ordinare" un provisioning a quel sistema.

## Cosa costruisco ora (dentro Lovable)

### 1. Sito cinematografico scrollytelling (l'effetto WOW)
Nuova area pubblica del progetto (route `/` marketing, separata dall'app autenticata):

- **7 capitoli**, ognuno una sezione pinnata (sticky 100vh) dove lo scroll verticale guida l'animazione frame-by-frame.
- Profondità 3D reale con `@react-three/fiber` + `@react-three/drei` (R3F v8 per React 18) per i capitoli chiave; resto in Framer Motion + scroll-driven animations.
- Capitoli 3 e 6 con scroll orizzontale nativo guidato dallo scroll verticale.
- Direzione visiva: **lusso silenzioso × impatto diretto** — nero/contrasto, tipografia grande, spazi ampi, movimento preciso (no parallax banale).
- Struttura capitoli proposta: (1) Hero manifesto, (2) Il problema, (3) Il workflow [scroll orizzontale], (4) BOQ/Gantt in azione, (5) Controllo costi & margini, (6) Tier a confronto [scroll orizzontale], (7) Call to action / onboarding.

### 2. Onboarding nel sito (collegato in modo ineccepibile)
Flusso guidato che termina con lo spazio cliente pronto:

1. Scelta tier (starter / pro / business) con i limiti reali già definiti.
2. Inserimento dati org (nome, email owner) + eventuale codice sconto e/o referral, validati live.
3. Scelta dominio: (a) dominio proprio → mostriamo istruzioni DNS chiare da seguire; (b) sottodominio `cliente.tuosoftware.com`; (c) "comprane uno" → segnaposto per il sistema di affiliazione (fase successiva).
4. Provisioning automatico via `site-api`: crea org, owner, subscription, applica sconto/referral, registra il dominio. Il cliente riceve l'accesso al suo spazio già configurato.

### 3. Referral e codici sconto
- Già esistono tabelle e RPC (`referral_codes`, `discount_codes`, `validate_discount`, `redeem_discount`, `apply_referral`) e gli endpoint in `site-api`.
- Aggiungo nel sito la validazione in tempo reale del codice durante l'onboarding e i pannelli di gestione (lato admin esistono già parzialmente in super-admin).

### 4. Pagamenti
Come richiesto: **solo struttura ora**. L'onboarding viene predisposto con uno step "pagamento" disattivato/segnaposto, pronto da collegare poi a Stripe o Paddle (richiede piano Pro di Lovable). Fino ad allora il provisioning resta in modalità test.

## Note tecniche

- Il sito vive nello stesso progetto, come sezione pubblica non autenticata; l'app gestionale resta dietro login.
- L'onboarding chiama `site-api` (che usa il service role lato server) tramite una piccola edge function pubblica intermedia, così la `SITE_API_KEY` non finisce mai nel frontend.
- 3D: `@react-three/fiber@^8.18`, `@react-three/drei@^9.122.0`, `three@>=0.133` (vincolo React 18).
- Performance: lazy-load delle scene 3D, fallback statici per mobile, attenzione al peso per non sacrificare lo scroll fluido.

## Fuori scope (da valutare a parte)
- Isolamento fisico per-cliente e auto-provisioning di istanze separate su VPS.
- Self-hosting dell'intera app sulla tua VPS.
- Sistema di acquisto domini in affiliazione (fase successiva, come hai indicato).
- Collegamento reale del provider di pagamento (quando passi a Pro).

## Domanda di conferma
Procedo con la strada **SaaS multi-tenant** (isolamento garantito via RLS + provisioning automatico) e costruisco sito + onboarding + referral/sconti, lasciando pagamenti come struttura? Oppure vuoi prima approfondire lo scenario "istanza fisica per cliente" e le sue implicazioni infrastrutturali?