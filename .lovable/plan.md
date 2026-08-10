# Tier, posti, referral e super-admin — pianificazione strategica

## Il punto che cambia tutto: si contano le persone, non i ruoli

Nel modello precedente limitavo i posti per singolo ruolo. È sbagliato per lo studio piccolo: lì una persona sola è architetto, preventivista e autorizza i pagamenti.

Nuovo principio: **una persona = un posto, con tutti i ruoli che serve**. Il tier limita **quante persone** ci sono nell'organizzazione, non quanti cappelli porta ciascuna.

Questo apre il software allo studio da 1-2 persone senza regalare nulla allo studio grande: un grande studio ha per forza tante persone, e con 5 posti non ci sta. La leva anti-abuso non è il ruolo, è il numero di teste più il volume di lavoro.

## Situazione attuale (verificata)

- I tier reali nel database sono **starter / pro / business** e oggi limitano solo i progetti attivi (2 / 8 / illimitati, imposto da un trigger) e lo spazio (2 / 10 GB / illimitato, dichiarato ma non bloccante).
- Non esiste **nessun limite di persone**: `invite-member` inserisce la membership senza alcun controllo di capienza.
- I ruoli stanno in `user_roles`, che **non ha la colonna organizzazione**: il ruolo è globale per utente. Con più clienti sullo stesso sistema questo è un problema di correttezza, non solo di conteggio.
- **Conflitto grave sul super-admin**: il ruolo `admin` dell'enum viene usato sia come amministratore dello studio cliente sia come super-admin di piattaforma. La pagina `/super-admin`, le funzioni `admin_list_all_orgs`, `admin_set_org_tier`, `admin_set_org_status`, `admin_global_metrics` e il bypass dei limiti nei trigger si sbloccano tutte con lo stesso `admin`. Oggi c'è una sola organizzazione quindi non è esploso, ma appena un cliente ha un proprio "admin" quel cliente vede e modifica **tutte** le organizzazioni.
- Referral: ogni organizzazione riceve automaticamente un codice, le redemption vengono registrate, ma **non esiste alcuna ricompensa** — nessuno sconto, nessun credito, nessun collegamento a un pagamento.
- **Nessun sistema di pagamento è attivo** su questo progetto: nessuna chiave di provider fra i secret. Oggi gli abbonamenti sono impostati a mano.

## 1. Modello posti per tier

### Struttura

- **Posti interni (a pagamento)**: chiunque lavori nello studio. Ogni persona può cumulare quanti ruoli vuole senza costi aggiuntivi.
- **Posti esterni (gratuiti)**: `client` e `supplier`, in sola lettura sul perimetro che li riguarda. Non consumano posti.

### Matrice

| | Starter | Pro | Business |
|---|---|---|---|
| Persone interne | 3 | 15 | illimitate |
| Ruoli per persona | tutti, cumulabili | tutti, cumulabili | tutti, cumulabili |
| Progetti attivi | 2 | 8 | illimitati |
| Archiviazione | 2 GB | 10 GB | illimitata |
| Client esterni | 5 | 30 | illimitati |
| Fornitori esterni | 10 | 100 | illimitati |
| Voci BOQ per progetto | 300 | 3.000 | illimitate |

### Perché non si può barare

Lo studio grande non può stare su Starter perché con 3 persone non gestisce il proprio organico: gli utenti dovrebbero condividere le credenziali, e in quel caso perdono tracciabilità delle firme, delle approvazioni e dell'audit — cioè esattamente il valore del software. In più incontra tre muri: 2 progetti attivi, 2 GB, 300 voci per progetto.

Le tre leve insieme (persone, progetti, volume) rendono il downgrade abusivo scomodo prima ancora che vietato.

### Segnalazione, non blocco improvviso

Se un'organizzazione Starter supera stabilmente le soglie d'uso (progetti archiviati e riaperti di continuo, voci vicine al tetto, molti client esterni), il super-admin lo vede in una lista "candidati upgrade" e può contattarli. Nessuna sospensione automatica.

## 2. Ruoli legati all'organizzazione

Prerequisito tecnico di tutto il resto: aggiungere l'organizzazione alla tabella dei ruoli, così un utente può avere ruoli diversi in studi diversi e il conteggio dei posti ha senso. I dati esistenti vengono migrati sull'unica organizzazione presente.

Nel pannello membri, il ruolo diventa una selezione multipla: "Marco Rossi → Architectural Dept + QS + Head of Payments". Un solo posto occupato.

## 3. Super-admin separato dal cliente

Va spezzato il doppio significato di `admin`:

- **`admin` resta il ruolo dell'amministratore dello studio cliente**, con potere solo dentro la propria organizzazione.
- **Nuovo livello di piattaforma** per te e il tuo team, memorizzato in una tabella dedicata (non nell'enum dei ruoli cliente, per evitare che si possa auto-assegnare), con due gradi:
  - **staff**: vede tutto in sola lettura, può impersonare per assistenza, vede metriche e log.
  - **owner di piattaforma**: in più cambia tier e stato, crea organizzazioni, gestisce codici sconto e referral, forza operazioni.

Tutte le funzioni `admin_*`, il bypass dei limiti nei trigger, l'accesso a `/super-admin` e la visibilità dei costi vanno riagganciate a questo nuovo livello.

Cosa aggiungere alla console `/super-admin`:
- Vista completa per organizzazione: persone, ruoli, progetti, spazio usato, abbonamento, referral, storico pagamenti.
- Modifica diretta di tier, stato, posti extra concessi a titolo commerciale.
- Impersonazione tracciata: ogni sessione impersonata viene registrata nell'audit con chi, quando e su quale organizzazione.
- Gestione del team di piattaforma: invitare colleghi come staff o owner.

## 4. Referral con ricompensa e pagamenti dal sito Kroneel

Oggi il referral registra chi ha portato chi e nient'altro. Va completato:

- **Ricompensa configurabile** (definita da te nella console): percentuale di sconto o mesi gratis, sia per chi invita sia per chi viene invitato, con eventuale durata e tetto massimo.
- **Credito maturato** per organizzazione, visibile dal cliente nella sua area su kroneel.com: quante persone ha portato, quanto ha maturato, cosa è già stato applicato.
- **Applicazione automatica al pagamento**: quando il cliente paga il rinnovo, lo sconto maturato viene scalato e registrato.
- **Pagina referral sul sito Kroneel**: codice personale, link condivisibile, contatore inviti, stato dei crediti.

Il collegamento fra sito e software passa dagli endpoint `site-api` già esistenti, estesi con il riepilogo referral e crediti.

**Punto da decidere prima di costruire**: nessun sistema di pagamento è attivo. Il referral con crediti ha senso solo appoggiato a un provider che gestisce abbonamenti ricorrenti. Le opzioni sono attivare i pagamenti integrati ora e costruirci sopra il referral, oppure costruire adesso solo la parte di calcolo e visualizzazione dei crediti, applicandoli a mano finché i pagamenti non ci sono.

## 5. Ordine di esecuzione consigliato

1. Ruoli legati all'organizzazione e ruoli multipli per persona (prerequisito).
2. Separazione super-admin di piattaforma e messa in sicurezza delle funzioni `admin_*`.
3. Limiti di posti per tier, imposti lato server, con contatore in interfaccia.
4. Console super-admin estesa.
5. Referral con ricompense e crediti.
6. Pagamenti e applicazione automatica dei crediti.

I punti 1 e 2 sono anche una correzione di sicurezza, non solo una funzionalità: finché restano così, il primo cliente con un utente `admin` vede i dati di tutti.

## Decisioni che servono da te

1. I numeri della matrice vanno bene? In particolare 3 persone su Starter e 15 su Pro.
2. Il tetto di voci BOQ per progetto (300 / 3.000) ti convince come freno all'abuso, o preferisci non metterlo?
3. Ricompensa referral: che forma vuoi darle (percentuale ricorrente, mesi gratis, sconto una tantum) e per quanto tempo?
4. Pagamenti: li attiviamo ora oppure costruiamo il referral in modalità "credito calcolato, applicazione manuale"?

## Note tecniche

- I posti si contano con una funzione dedicata analoga a `get_org_active_project_count`, esposta nel riepilogo abbonamento e imposta sia in `invite-member` sia con un trigger sulla membership.
- Il livello di piattaforma va in una tabella separata con policy che ne impediscono la scrittura da parte degli utenti; le funzioni `admin_*` sostituiscono `has_role(auth.uid(),'admin')` con il nuovo controllo.
- Anche `can_see_costs` va rivista: oggi include `admin`, che dopo la separazione va inteso come admin dello studio, non di piattaforma.
- Tutte le migrazioni sono additive: nessun dato storico viene rimosso.
