## Punto di partenza — cosa è già in piedi (verificato)

- Studio Scope (questo progetto) gira su **Lovable Cloud** (un solo Supabase). Multi-tenancy è **logica**, via tabelle `organizations`, `organization_members`, RLS.
- Esiste già un'edge function `site-api` con endpoint per: create org, subscription sync, discount/referral validate & redeem, custom domain, org lookup. Autenticata via header `x-site-api-key` (secret `SITE_API_KEY` già configurato).
- Esiste documentazione integrazione in `SITE_INTEGRATION_API.md`.
- Il file `src/marketing/Landing.tsx` è disattivato in `App.tsx`.

## Nodo critico da chiarire prima di scrivere codice

La tua risposta "**ogni cliente kroneel deve avere un dock separato, compartimenti stagni**" è **in conflitto con l'architettura attuale di Studio Scope**, che è multi-tenant su un singolo DB Supabase. Devo dirti chiaramente cosa comporta, senza inventare.

### Due modelli possibili — non si possono mescolare

**Modello A — Multi-tenant logico (l'attuale)**
- Un'unica app Studio Scope + un solo Postgres.
- Isolamento cliente = RLS su `organization_id`.
- Non c'è "container per cliente". Un bug in una policy può teoricamente esporre dati fra clienti (mitigato da audit e test, ma non fisicamente impossibile).
- Provisioning cliente = 1 chiamata a `site-api/organizations` → istantaneo, zero costi extra.
- Compatibile con Lovable Cloud e con l'esistente.

**Modello B — Container per tenant ("compartimenti stagni")**
- Ogni cliente = **1 container app + 1 database Postgres proprio** sulla tua VPS.
- Isolamento fisico: un cliente non può leggere l'altro nemmeno con un bug applicativo.
- Provisioning = crea DB, esegui migrazioni schema Studio Scope, avvia container, configura reverse proxy, crea utente owner. Serve un **orchestratore**.
- Costi VPS/RAM crescono linearmente col numero di clienti (ogni Postgres consuma memoria).
- **Non è compatibile con Lovable Cloud in produzione**: Lovable Cloud è un solo Supabase condiviso. Il container-per-tenant esiste solo dopo il deploy sulla tua VPS.
- Kroneel signup **non può** più chiamare `site-api/organizations` sul progetto Lovable, perché quello inserisce in un DB unico. Deve chiamare un **orchestratore self-hosted sulla tua VPS**.

Hai scelto Modello B. Quindi il piano seguente assume compartimenti stagni. La conseguenza importante che devi accettare consapevolmente:

> **Studio Scope come vive oggi su Lovable Cloud smetterà di essere l'ambiente di produzione.** Rimane lo strumento di sviluppo / staging. La produzione sarà l'immagine Docker di Studio Scope + Postgres, orchestrata sulla VPS. La logica `organizations` interna diventa ridondante (ogni container ha un solo cliente).

Se questo non è ciò che intendevi, torna al Modello A e ci fermiamo qui.

---

## Piano (assumendo Modello B confermato)

### 1. Progetto B "Kroneel" — nuovo progetto Lovable separato
- Sito bianco senza grafica, solo bottoni: **Home**, **Pricing (3 tier)**, **Signup**, **Login**, pagina **Dashboard cliente** (post-login).
- Stack Vite/React identico a Studio Scope per omogeneità di build.
- Deploy target: container Docker sulla VPS, dietro reverse proxy su `kroneel.com` e `www.kroneel.com`.
- Il progetto B ha il proprio DB (Postgres o Supabase self-hosted sulla VPS) per: utenti Kroneel, subscription, referral, discount, mapping cliente → istanza tenant.

### 2. Signup senza pagamento
Flusso:
```text
Utente su kroneel.com/signup
  → sceglie tier (Starter/Pro/Business, dati da tabella locale Kroneel)
  → sceglie hostname:
       (a) sottodominio: <slug>.kroneel.com
       (b) dominio custom: <suo-dominio>
  → email + password
  → account Kroneel creato, subscription in stato "trial"
  → invia richiesta a Orchestratore
```

### 3. Orchestratore VPS (nuovo servizio, self-hosted)
Non è un progetto Lovable. È un piccolo servizio (Node/Deno/Go — sceglierai) che gira sulla VPS con privilegi Docker. API interna chiamata solo dal backend di Kroneel.

Responsabilità:
1. Ricevere `provision(tenant_slug, tier, owner_email)`.
2. Creare **Postgres dedicato** (container `postgres:16` con volume `pg-<slug>`) oppure un nuovo schema/DB su una singola istanza Postgres condivisa se preferisci fase 1 più leggera (da decidere insieme).
3. Applicare le **migrazioni Studio Scope** su quel DB (export dello schema attuale come file SQL versionato in repo).
4. Avviare container **studio-scope-app:<version>** collegato a quel Postgres, con env `TENANT_SLUG`, `TENANT_TIER`, `POSTGRES_URL`.
5. Aggiornare la config del reverse proxy (Traefik o Caddy) con label o file di config per instradare `<slug>.kroneel.com` → container.
6. Creare l'utente owner nel DB del tenant (script SQL / call ad admin API dell'istanza).
7. Ritornare stato "ready" a Kroneel.

Note tecniche:
- **Reverse proxy consigliato: Traefik** con provider Docker + wildcard TLS via Let's Encrypt DNS-01 su `*.kroneel.com`. Motivo: label auto-discovery, TLS wildcard automatico, gestione domini custom on-the-fly.
- Costo memoria per tenant: circa 150–300 MB Postgres + 100–200 MB app Node = **~400 MB per cliente**. Su VPS 4 GB stimi ~7–8 clienti utili. Se prevedi decine di clienti servirà VPS più grande o passare a "schema per tenant su un solo Postgres" (isolamento logico più forte del RLS ma senza costo per-container Postgres).

### 4. Wildcard DNS e domini custom
- Presso il registrar di `kroneel.com`, un record wildcard: `*.kroneel.com A <IP-VPS>` e `kroneel.com A <IP-VPS>`.
- Certificato wildcard `*.kroneel.com` via DNS-01 (richiede API key del DNS provider passata a Traefik).
- Domini custom cliente (es. `scope.studiorossi.it`): il cliente fa CNAME/A verso VPS, l'orchestratore aggiunge il dominio alla config Traefik del suo container, Traefik emette cert HTTP-01 al volo.

### 5. Studio Scope — adattamenti per essere self-hostable per-tenant
Cambi minimi e circoscritti al deploy, senza toccare le UI:
- Dockerfile multi-stage per app (build Vite + serve static + eventuale mini-server per `.env` runtime).
- Le env `VITE_SUPABASE_*` diventano **runtime**, non build-time (perché ogni container punta a un Postgres diverso). Serve un piccolo shim che sostituisce placeholder all'avvio o servire un `/config.js` dinamico.
- Migrazioni schema esportate da Lovable Cloud in `supabase/migrations/*.sql` versionati (procedura di export una tantum).
- Supabase Auth: se vuoi Auth per-tenant serve **GoTrue self-hosted** nel bundle del tenant. Se preferisci semplificare, si può passare a **auth locale** (utenti in `public.users`, hash bcrypt, JWT firmato dall'app). Da decidere: è una scelta grossa, mettiamola come sotto-decisione (D1).

### 6. Kroneel ↔ Orchestratore ↔ Tenant
```text
Kroneel signup UI
   │  (POST /api/tenants { slug, tier, owner_email, password_hash })
   ▼
Kroneel backend (Deno/Node, self-hosted)
   │  (POST http://orchestrator:9000/provision, HMAC signed)
   ▼
Orchestrator VPS
   │  docker run postgres-<slug>
   │  psql < migrations/*.sql
   │  docker run studio-scope-app-<slug>
   │  traefik reload
   │  seed owner user
   ▼
<slug>.kroneel.com  (Traefik) → container studio-scope-<slug>
```

### 7. Dettaglio Progetto B (Lovable) — cosa costruisco qui
Solo la parte web. Pagine:
- `/` Home con 3 bottoni (Pricing, Signup, Login) — nessuno stile, HTML puro.
- `/pricing` — 3 card tier con bottone "Scegli".
- `/signup?tier=xxx` — form email/password/company + input hostname + submit.
- `/login` — form email/password.
- `/dashboard` — mostra stato tenant ("provisioning", "ready", link a `<slug>.kroneel.com`).
- Backend Kroneel come edge function del progetto B (auth utenti Kroneel + call HMAC verso orchestratore).

Il progetto B **non tocca** il DB di Studio Scope. Vive di vita propria.

### 8. Cosa NON facciamo in questa fase (rimandato)
- Pagamenti Stripe (rimane placeholder "trial 30 giorni").
- Grafica cinematografica scrollytelling (arriva dopo, sopra lo scheletro bianco).
- Migrazione automatica upgrade tier fra container (per ora tier è metadato, non cambia risorse).
- Backup automatici per-tenant (necessari in produzione, li pianifichiamo separatamente).

---

## Decisioni ancora da prendere prima di partire

**D1. Auth nei tenant.**
Studio Scope oggi usa Supabase Auth (GoTrue). Nel container-per-tenant hai due strade:
- **D1a.** Includere GoTrue per tenant (fedele all'attuale, +80 MB RAM/tenant, complessità config invito email SMTP per tenant).
- **D1b.** Riscrivere auth come locale (`users` table + bcrypt + JWT locale). Meno consumo, più codice da scrivere/testare, si perdono email invite pronte all'uso.

**D2. Un Postgres per tenant vs uno schema per tenant.**
- **D2a.** Container Postgres dedicato per tenant (compartimenti stagni pieni, ~200 MB/tenant).
- **D2b.** Un solo Postgres condiviso, uno schema per tenant, connessioni con `search_path` diverso. Isolamento più forte di RLS, molto meno pesante, ma dump/restore/backup indipendenti richiedono più attenzione.

**D3. Orchestratore — linguaggio.**
Node/Deno (facile riuso codice TS), Go (binario singolo, robusto per gestire Docker), Bash + systemd (semplice ma fragile). Consiglio: **Deno** per omogeneità stack.

**D4. Reverse proxy: Traefik confermato?**
Alternativa Caddy: config file singolo, ottimo wildcard TLS, meno label-driven. Traefik è più adatto a "container che si aggiungono dinamicamente".

Vuoi rispondere D1–D4 e ripartiamo con un piano operativo di implementazione? Oppure, se preferisci, iniziamo comunque il **Progetto B** (sito bianco + signup UI) mentre queste decisioni si sedimentano — quella parte non dipende da D1–D4.
