## Analisi dei 10 file Revit ricevuti

I file sono **Revit Schedules** esportati in Excel — ognuno copre una categoria diversa. Sono utilizzabili **al 60%**: il dato c'è ma il formato è "human-readable" (header decorativi, righe di raggruppamento per stanza, immagini come placeholder vuoti) e va normalizzato prima dell'import.

### Mappatura file → categoria StudioScope

| File Revit | Categoria BOQ StudioScope | Codice | Righe utili |
|---|---|---|---|
| Joinery_Schedule | `joinery` | JOI | 10 |
| Loose_Furniture_Schedule | `loose-furniture` | LF | ~35 |
| Lighting_Fixture | `lighting` | LT | ~20 |
| Floor_Schedule | `finishes` (FL) | FL | 4 |
| Office_Wall_Schedule | `finishes` (CL/WF) | CL/WF | 2 |
| Skirting_Schedule | `finishes` (SK) | SK | 2 |
| Door_Schedule | `joinery` (DR) | DR | 9 |
| Appliances | `appliances` | KA/TV | 6 |
| Office_Equipment | `ffe` | OA | 2 |
| Workstations | `electrical` (PC) | EL | 21 |

**Totale: ~110 item importabili** per il progetto ufficio.

### Cosa c'è (recuperabile)

- **Type Mark** → univoco per modello (es. J08, LF11, TL1) → diventa `boq_code`
- **Room/Area** (header di gruppo) → mappabile a `area` o `Floor/Apartment/Room`
- **Description / Specification** → `description`
- **Size / Width / Height / Length** → `dimensions`
- **Count / QTY** → `quantity`
- **Top Material / Base Material / Finish** (solo Loose Furniture) → `material` + `finish`
- **Area in m²** (Floor/Wall/Skirting) → `quantity` con `unit_of_measure`

### Cosa manca (gap rispetto al modello StudioScope)

| Campo richiesto | Presente in Revit? | Soluzione |
|---|---|---|
| Floor / Apartment / Room hierarchy | Solo "Room Name" piatto | Default "Ground Floor / Office / [Room]" |
| Supplier / Manufacturer | Tra parentesi nel testo (es. "Bonaldo") | Estrazione regex |
| Unit cost / Budget estimate | NO | Compilato dopo dal QS |
| Reference Image URL | Cella vuota (immagine embedded in Revit) | Il design team deve esportare URL/cartella |
| Material/Color separati | Mischiati in "Finish" come testo libero | Parser euristico + revisione manuale |
| Approval status | NO | Default "pending" |
| Lead time | NO | Default 12 giorni |

### Problemi strutturali del formato attuale

1. **Header di sezione mischiati con i dati**: la riga "CEO Office" è una riga vuota di raggruppamento, non un dato. L'importer deve riconoscerla e propagarla come `area` alle righe seguenti.
2. **Immagini assenti**: la colonna "Image" è sempre vuota perché Revit incolla immagini embedded che Excel/exceljs non legge come URL.
3. **Multi-categoria nello stesso file**: Floor/Wall/Skirting sono tutti "finishes" ma in 3 file diversi.
4. **Type Mark duplicati**: lo stesso `LF21` appare in 4 stanze diverse → diventano 4 item separati con stessa specifica ma quantità/area diverse.

---

## Proposta: 3 strade

### Strada A — Template CSV Master (consigliata, rapida)

Definire **un unico CSV standard** che il design department compila a mano oppure ottiene dal merge dei loro Revit Schedules. Una riga = un item nel BOQ.

```text
project_code,floor,room_type,room_number,room_name,category,subcategory,
type_mark,description,supplier,quantity,unit,width_cm,depth_cm,height_cm,
material_top,material_base,finish,reference_image_url,notes
```

Esempio compilato (5 righe estratte dai tuoi file):

```text
1003,GF,Office,29,CEO Office,loose-furniture,LF,LF12,
Diver executive desk,Bonaldo,1,pcs,258,135,75,
Walnut Canaletto veneer,Bronze opaque metal,,
,
1003,GF,Office,29,CEO Office,lighting,CL,CL2,Chandelier,,2,pcs,,,,,,,,
1003,GF,Conference,28,Conference Room,joinery,WC,J11,Wall Cabinet,,1,pcs,370,45,275,,,,,
1003,GF,Pantry,26,Pantry,appliances,KA,KA1,Side by Side Refrigerator,,1,pcs,,,,,,,,
1003,GF,Office,22,Working Space,finishes,FL,AF01,Carpet finish,,211.90,m²,,,,,,,,
```

**Pro**: zero retro-ingegneria, design team usa Excel/Google Sheet, importer pronto in 2h.  
**Contro**: doppio lavoro per il designer (Revit → CSV).

### Strada B — Multi-Schedule Importer (medio sforzo)

Importare direttamente i 10 file Revit così come sono. Per ognuno scrivere un parser specifico che:
- riconosce le righe-header di stanza (cella su una sola colonna)
- propaga `Room` alle righe successive
- mappa la categoria in base al nome del file
- estrae il supplier dalle parentesi tonde nel testo
- normalizza Size in width/depth/height

**Pro**: design team continua a lavorare in Revit.  
**Contro**: parser fragile (se cambia nome colonna o ordine, si rompe), immagini comunque assenti.

### Strada C — Plugin Revit (lungo termine)

Plugin C# / Dynamo che legge il modello Revit, prende anche le immagini dei tipi, le carica su Lovable Cloud Storage, e fa POST diretto al backend StudioScope tramite endpoint `/api/projects/{id}/import-from-revit`.

**Pro**: vero "single source of truth", aggiornamenti incrementali (solo item modificati), immagini incluse.  
**Contro**: 2-4 settimane di dev, richiede licenza Revit + ambiente .NET. Va pianificato come progetto a parte dopo il beta.

---

## Mia raccomandazione

**Fase 1 (ora, per il test)**: **Strada A** — ti consegno il template CSV ufficiale + un importer dedicato "Revit BOQ CSV" nel BOQ Analyst. Per il progetto 1003 io stesso converto i 10 file in 1 CSV pronto da importare, così testi subito.

**Fase 2 (quando il flusso è validato)**: **Strada B** — importer multi-Excel che legge i Revit Schedules nativi, per evitare il doppio lavoro al design team.

**Fase 3 (roadmap)**: **Strada C** — plugin Revit con sync bidirezionale.

---

## Cosa farei concretamente in build mode

1. Creare `docs/REVIT_CSV_TEMPLATE.md` con specifica colonne, valori ammessi e 3 esempi.
2. Generare `templates/revit_boq_template.csv` scaricabile dal CSVImportDialog.
3. Convertire i tuoi 10 file in `1003_master_boq.csv` pronto da importare (te lo passo come artifact).
4. Estendere `CSVImportDialog.tsx` per supportare le **nuove colonne**: floor, room_type, room_number, subcategory, type_mark, supplier, dimensions (W/D/H), material_top, material_base, finish, reference_image_url.
5. Aggiungere logica di **dedup** su `(project_id, type_mark, room_number)` per consentire re-import senza duplicati (update invece di insert).
6. Validazione preview: mostrare la tabella prima dell'import con conteggio per categoria/stanza ed evidenziare righe con campi mancanti.

### Tecnico

- I nuovi campi `floor`, `room_type`, `room_number` vanno verificati sullo schema `project_items` — se mancano li aggiungo come migrazione side-by-side (memoria: mai droppare colonne).
- Parsing `Size` con regex `/W?(\d+\.?\d*)\s*[xX×]\s*D?(\d+\.?\d*)\s*[xX×]\s*H?(\d+\.?\d*)/` per estrarre dimensioni.
- Estrazione supplier con regex `/\(([^)]+)\)\s*$/` (es. "Diver executive desk (Bonaldo)" → "Bonaldo").
- Batch insert da 50 righe (memoria progetto: già standard).
- Per le immagini: aggiungere colonna `reference_image_url` opzionale; il design team può linkare un Drive/Dropbox pubblico per ogni Type Mark.

---

## Decisione richiesta

Conferma:
1. **Procedo con Strada A** (template CSV + conversione del tuo progetto 1003)?
2. **Vuoi anche che generi adesso** (qui in chat, senza modificare il codice) il `1003_master_boq.csv` consolidato dai 10 file, così lo guardi prima?

Se OK su entrambi, in build mode faccio il template + estendo l'importer + ti consegno il CSV pronto del progetto ufficio.
