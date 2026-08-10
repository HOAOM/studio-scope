# Tier, ruoli e posti per ruolo — pianificazione strategica

## Situazione attuale (verificata)

- I tier reali nel database sono **starter / pro / business**. Oggi limitano solo due cose: numero di progetti attivi (2 / 8 / illimitati, imposto da un trigger sul database) e spazio di archiviazione (2 / 10 GB / illimitato, dichiarato ma non ancora bloccante).
- Esiste un secondo modello di tier **solo di facciata**, salvato nel browser, con nomi diversi (base / pro / enterprise) e campi `maxUsersPerRole` e `maxTotalUsers`. Non è collegato al database e chiunque può modificarlo: oggi non limita nulla.
- I ruoli sono 14 nell'enum `app_role` e vengono assegnati nella tabella `user_roles`, che **non ha una colonna organizzazione**: il ruolo è globale per utente, non per studio. Attualmente ci sono 13 assegnazioni su un solo studio, quindi la cosa non è ancora emersa come problema, ma con più clienti diventa bloccante.
- L'invito di un membro (`invite-member`) inserisce la membership senza alcun controllo di capienza.

Conseguenza: oggi **non esiste alcun limite di posti**, né totale né per ruolo, e non è nemmeno possibile imporlo correttamente finché il ruolo non è legato all'organizzazione.

## Obiettivo

Definire, per ciascuno dei tre tier, quanti account sono ammessi in totale e quanti per ogni ruolo, e rendere questi limiti reali (imposti dal server, non aggirabili).

## Modello proposto

### Principio: tre classi di posto

Non tutti i ruoli hanno lo stesso peso commerciale. Proposta di separarli in tre classi, così il prezzo segue il valore d'uso:

- **Posti interni (a pagamento)**: ceo, coo, project_manager, head_of_design, designer, architectural_dept, qs, accountant, head_of_payments, procurement_manager, site_engineer, mep_engineer, admin.
- **Posti esterni gratuiti in sola lettura**: client, supplier. Vedono solo ciò che li riguarda e non consumano posti a pagamento.
- **Owner**: l'utente che ha creato l'organizzazione, sempre incluso, occupa un posto interno.

### Matrice proposta

| | Starter | Pro | Business |
|---|---|---|---|
| Posti interni totali | 5 | 20 | illimitati |
| Ruoli attivabili | solo il nucleo base | tutti | tutti |
| Massimo per singolo ruolo | 1 | 5 | illimitato |
| admin / ceo | 1 | 2 | illimitato |
| project_manager | 1 | 3 | illimitato |
| designer + architectural_dept | 2 in totale | 8 in totale | illimitato |
| qs / accountant / head_of_payments | 1 in totale | 4 in totale | illimitato |
| procurement_manager | 1 | 3 | illimitato |
| site_engineer / mep_engineer | 1 in totale | 4 in totale | illimitato |
| client (esterno, gratis) | 5 | 30 | illimitato |
| supplier (esterno, gratis) | 5 | 50 | illimitato |

"Nucleo base" per Starter significa: admin, project_manager, designer, qs, client, supplier. Gli altri ruoli richiedono Pro — è la leva di upgrade principale.

### Perché questi numeri

- Starter è per lo studio piccolo con 2 progetti: 5 persone interne coprono titolare, un PM, due designer, un preventivista. Oltre a questo il lavoro non sta in 2 progetti.
- Pro riflette lo studio strutturato: 20 interni con più designer e la catena procurement/finance separata.
- Business toglie i limiti e diventa la versione trattata a contratto.

## Come lo rendiamo reale

1. **Legare il ruolo all'organizzazione**: aggiungere l'organizzazione alla tabella dei ruoli, migrando le assegnazioni esistenti sull'unica organizzazione presente. Senza questo passo qualsiasi conteggio per ruolo è privo di senso.
2. **Definire i limiti nel database**, come già fatto per progetti e storage: una tabella di configurazione tier → ruolo → massimo, così i limiti si cambiano senza toccare il codice.
3. **Bloccare al momento dell'invito**: controllo lato server sia nella funzione di invito sia con un trigger sull'inserimento della membership/ruolo, così il limite regge anche a chiamate dirette.
4. **Mostrarlo nell'interfaccia**: nel pannello membri, contatore "posti usati / disponibili" per ruolo e messaggio chiaro di upgrade quando si esaurisce.
5. **Allineare il sito Kroneel**: la pagina prezzi deve elencare esattamente questi numeri, letti dalla stessa fonte via `site-api`, per evitare divergenze fra promessa commerciale e comportamento del software.
6. **Rimuovere il vecchio modello nel browser** (base/pro/enterprise), sostituendolo ovunque con i tier reali del database.

## Casi limite da decidere

- **Downgrade con posti in eccesso**: proposta di non cacciare nessuno, ma congelare gli inviti e segnalare l'eccedenza finché non rientra.
- **Doppio ruolo sulla stessa persona**: proposta di contare un solo posto per persona, e verificare i massimi per ruolo su ogni ruolo assegnato.
- **Utente disattivato**: libera il posto solo quando la membership viene rimossa, non alla semplice inattività.

## Decisioni che servono da te

1. I numeri della matrice vanno bene o vuoi correggerli (in particolare i 5 posti Starter e i 20 Pro)?
2. Client e supplier restano gratuiti e illimitati di fatto, o vuoi che consumino posti anche loro?
3. Su Starter limitiamo davvero i ruoli disponibili al nucleo base, oppure lasciamo tutti i ruoli e limitiamo solo i numeri?

## Note tecniche

- Il conteggio dei posti va calcolato lato server con una funzione dedicata, analoga a `get_org_active_project_count`, e restituito insieme al resto del riepilogo abbonamento (`get_my_org_subscription_summary`).
- L'aggiunta dell'organizzazione ai ruoli tocca le policy di sicurezza che oggi usano `has_role`: vanno riviste una per una, mantenendo la variante globale per l'amministratore di piattaforma.
- La migrazione è additiva: nessuna colonna o dato storico viene rimosso.
