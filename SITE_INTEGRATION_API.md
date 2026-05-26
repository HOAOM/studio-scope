# Studio Scope — Site Integration API

Documento tecnico per il web expert che svilupperà il sito di vendita esterno.
Questa API permette al sito di provisionare nuove organizzazioni clienti,
validare codici sconto/referral, sincronizzare lo stato abbonamento (Stripe/manuale)
e collegare domini custom.

---

## 1. Endpoint base

```
https://grpzbxwafkcvecphnyyb.supabase.co/functions/v1/site-api
```

Tutte le rotte sono in formato `POST` (con body JSON) o `GET` (con query string).
Risposte sempre `application/json`.

---

## 2. Autenticazione

Tutte le chiamate richiedono l'header:

```
x-site-api-key: <SITE_API_KEY>
```

Il valore di `SITE_API_KEY` è stato generato e salvato nei secrets di Lovable Cloud.
Va consegnato al web expert in modalità sicura (password manager, NON via email/chat).
Se compromesso → ruotare dal pannello secrets di Lovable Cloud (verrà fornito nuovo valore).

Risposta su chiave mancante o errata:
```json
{ "error": "unauthorized" }  // HTTP 401
```

---

## 3. Endpoint disponibili

### 3.1 Health check
```
GET /site-api/health
```
Risposta:
```json
{ "ok": true, "ts": "2026-05-26T07:00:00.000Z" }
```

---

### 3.2 Creare una nuova organizzazione (cliente)
```
POST /site-api/organizations
```
Body:
```json
{
  "name": "Studio Rossi Architetti",
  "owner_email": "mario@studiorossi.it",
  "owner_display_name": "Mario Rossi",        // opzionale
  "tier": "pro",                              // "starter" | "pro" | "business" (default: starter)
  "custom_domain": "scope.studiorossi.it",    // opzionale
  "referral_code": "ABCD1234",                // opzionale
  "discount_code": "LAUNCH20"                 // opzionale
}
```
Cosa fa:
1. Crea l'utente proprietario (se non esiste) e gli invia email di invito per impostare la password.
2. Crea l'organizzazione con slug generato dal nome.
3. Lega l'utente come `is_owner=true`.
4. Crea il record `organization_subscriptions` con tier scelto, stato `active`, periodo 30 giorni.
5. Applica referral code (se fornito e valido).
6. Applica discount code (se fornito e valido).

Risposta `201`:
```json
{
  "organization_id": "uuid",
  "slug": "studio-rossi-architetti",
  "owner_user_id": "uuid",
  "tier": "pro",
  "referral_applied": true,
  "discount_applied": false
}
```

---

### 3.3 Sincronizzare lo stato abbonamento (webhook Stripe / manuale)
```
POST /site-api/subscription/sync
```
Body (tutti i campi opzionali tranne `organization_id`):
```json
{
  "organization_id": "uuid",
  "tier": "pro",                                  // "starter" | "pro" | "business"
  "status": "active",                             // "active" | "grace" | "suspended" | "purge_pending"
  "current_period_end": "2026-06-26T00:00:00Z",
  "stripe_customer_id": "cus_XXXXXXXXXXXX"
}
```
Quando chiamarlo:
- Da webhook Stripe `invoice.paid` → aggiorna `current_period_end` e `status=active`.
- Da webhook Stripe `customer.subscription.deleted` → `status=suspended`.
- Da pannello admin manuale → upgrade/downgrade tier.

Risposta:
```json
{ "subscription": { ...record completo... } }
```

---

### 3.4 Validare un codice sconto (prima del checkout)
```
POST /site-api/discount/validate
```
Body:
```json
{ "code": "LAUNCH20", "organization_id": "uuid" }
```
Risposta:
```json
{
  "result": {
    "valid": true,
    "reason": "ok",
    "percent_off": 20,
    "amount_off": null
  }
}
```
Reason possibili se `valid=false`: `not_found`, `inactive`, `not_yet_valid`, `expired`, `wrong_org`, `wrong_tier`, `exhausted`, `already_redeemed`.

---

### 3.5 Riscattare un codice sconto (dopo pagamento)
```
POST /site-api/discount/redeem
```
Body:
```json
{ "code": "LAUNCH20", "organization_id": "uuid" }
```
Risposta:
```json
{ "redeemed": true }
```

---

### 3.6 Applicare un codice referral
```
POST /site-api/referral/apply
```
Body:
```json
{ "code": "ABCD1234", "organization_id": "uuid" }
```
Risposta:
```json
{ "applied": true }
```
Vincoli: un'organizzazione non può applicare il proprio codice referral. Un'org può essere referenziata una volta sola.

---

### 3.7 Impostare/cambiare dominio custom
```
POST /site-api/custom-domain
```
Body:
```json
{ "organization_id": "uuid", "custom_domain": "scope.studiorossi.it" }
```
Risposta:
```json
{ "organization": { "id": "uuid", "name": "...", "slug": "...", "custom_domain": "..." } }
```
Nota: la verifica DNS e provisioning SSL del dominio sono separati e gestiti via il pannello Lovable.

---

### 3.8 Cercare organizzazione (per routing del sito)
```
GET /site-api/org/lookup?slug=studio-rossi-architetti
GET /site-api/org/lookup?domain=scope.studiorossi.it
GET /site-api/org/lookup?id=uuid
```
Risposta:
```json
{ "organization": { "id": "uuid", "name": "...", "slug": "...", "custom_domain": "..." } }
```
Oppure `404` se non trovata.

---

## 4. Codici di errore generici

| HTTP | Significato                                |
|------|--------------------------------------------|
| 200  | OK                                         |
| 201  | Creato                                     |
| 400  | Body o parametri mancanti / non validi     |
| 401  | `x-site-api-key` mancante o errata         |
| 404  | Risorsa non trovata o rotta inesistente    |
| 500  | Errore interno (vedi `detail` nel body)    |

---

## 5. Esempio end-to-end (curl)

Onboarding completo di un nuovo cliente Pro con codice sconto:

```bash
curl -X POST https://grpzbxwafkcvecphnyyb.supabase.co/functions/v1/site-api/organizations \
  -H "x-site-api-key: <SITE_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Studio Rossi Architetti",
    "owner_email": "mario@studiorossi.it",
    "tier": "pro",
    "discount_code": "LAUNCH20"
  }'
```

Successivamente, da webhook Stripe quando il primo pagamento va a buon fine:

```bash
curl -X POST https://grpzbxwafkcvecphnyyb.supabase.co/functions/v1/site-api/subscription/sync \
  -H "x-site-api-key: <SITE_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "<uuid>",
    "status": "active",
    "current_period_end": "2026-06-26T00:00:00Z",
    "stripe_customer_id": "cus_XXXXX"
  }'
```

---

## 6. Note operative

- L'utente proprietario riceve un'email di invito Supabase con link per impostare la password al primo accesso.
- Tier e relativi limiti progetti attivi: Starter=2, Pro=8, Business=illimitati.
- Il ciclo di vita abbonamento (`active → grace → suspended → purge_pending`) è gestito da
  un job interno (`tick_subscription_lifecycle`); il sito non deve gestirlo manualmente.
- L'API è idempotente per email duplicate: ri-inviare la stessa email come `owner_email`
  riusa l'utente esistente.

---

## 7. Contatto

Per modifiche o estensioni dell'API contattare l'owner del progetto Lovable.
