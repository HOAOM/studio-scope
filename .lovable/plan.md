## Obiettivo

Aggiungere una nuova sezione **Addon** nella sidebar a scomparsa del progetto, posizionata **sotto Chat**, contenente tre voci:
- **Marble Slab**
- **Door** (futuro addon gestione porte)
- **Windows** (futuro addon gestione finestre)

Nota: la gestione vera delle porte/finestre **non si costruisce ora**. In questo intervento creiamo solo la struttura di navigazione e dei pannelli segnaposto. L'etichetta "Addon" è provvisoria (in futuro l'utente vedrà solo gli addon che ha acquistato).

## Cosa cambia

### 1. `src/components/layout/ProjectSidebar.tsx`
- Estendere il tipo `ProjectSection` con tre nuovi valori: `'marble-slab' | 'door' | 'windows'`.
- Creare una seconda lista (es. `ADDON_ITEMS`) con le tre voci e relative icone (es. `Layers` per Marble Slab, `DoorOpen` per Door, `AppWindow` per Windows — icone già disponibili in `lucide-react`).
- Aggiungere un secondo `SidebarGroup` con label "Addon" (mostrata solo quando la sidebar è espansa), reso **dopo** il gruppo principale che contiene Chat, così appare visivamente sotto.

### 2. `src/pages/ProjectDetail.tsx`
- Aggiungere tre nuovi `TabsContent` (`marble-slab`, `door`, `windows`) dopo il blocco Chat.
- Ognuno mostra un pannello segnaposto pulito (titolo + breve testo "Addon in arrivo / non ancora attivo"), coerente con il design system (token semantici, card).

Nessuna modifica al database, ai ruoli o alla logica di business. È solo navigazione + UI segnaposto.

```text
Sidebar (a scomparsa)
├─ Project
│   ├─ Overview
│   ├─ BOQ Analyst
│   ├─ ...
│   └─ Chat
└─ Addon            ← nuovo gruppo
    ├─ Marble Slab
    ├─ Door
    └─ Windows
```

## Dettagli tecnici

- I tre nuovi valori del tipo entrano nel union `ProjectSection`, quindi `activeTab` e `setActiveTab` continuano a funzionare senza altre modifiche.
- I pannelli segnaposto non richiedono hook o query: componenti statici inline o piccoli sotto-componenti.
- Le icone si importano da `lucide-react` (già usato ovunque).

---

## I prossimi passi (spiegati semplice)

Dopo aver creato questi "contenitori" vuoti, ecco cosa serve per arrivare ad addon funzionanti e online:

1. **Decidere cosa fa ogni addon.** Per "Door" e "Windows": quali dati servono per ogni porta/finestra (misure, materiale, ferramenta, fornitore, prezzo, stato)? Una volta deciso, costruiamo le tabelle nel database e la schermata di gestione (lista + dettaglio), simile a come oggi gestisci gli item.

2. **Collegare gli addon all'abbonamento.** Oggi l'etichetta è "Addon" generica. Il passo è: ogni studio vede e usa **solo** gli addon che ha pagato. Serve una tabella che dice "questa organizzazione ha attivo l'addon Door/Windows/Marble Slab" e la sidebar mostra le voci di conseguenza.

3. **Marble Slab.** Va chiarito cosa deve fare questo addon (gestione lastre di marmo: tracciamento lastre, dimensioni, sfridi, abbinamento agli item?). Stesso percorso: definire dati → tabella → schermata.

4. **Mettere online per i primi test** (indipendente dagli addon): completare i punti già in lista nel `PROJECT_SUMMARY.md` — collegare i domini al pannello, aggiungere gli URL di redirect per il login, pubblicare. Gli addon segnaposto non bloccano la messa online.

Quando vuoi partire con uno degli addon (es. Door), basta dirmi quali campi servono per ogni porta e lo costruiamo per primo.