# Revit BOQ → StudioScope CSV Template

Formato CSV ufficiale che il **design department** deve compilare (a partire da Revit Schedules) per importare il BOQ dentro StudioScope.

Una riga = un item del BOQ. Stesso `type_mark` in stanze diverse = righe separate (la stanza fa parte della chiave di dedup).

## Colonne

| Colonna | Obbligatorio | Esempio | Note |
|---|---|---|---|
| `project_code` | sì | `1003` | Deve esistere in StudioScope |
| `floor` | sì | `GF`, `01`, `02` | Codice piano (max 2 char) |
| `room_type` | sì | `Office`, `Pantry`, `Conference`, `Reception`, `Workstation`, `All` | Tipologia ambiente |
| `room_number` | sì | `29`, `01`, `00` | Numero univoco stanza nel piano. `00` = "tutto il progetto" |
| `room_name` | sì | `CEO Office` | Nome leggibile (Revit "Room: Name") |
| `category` | sì | `joinery`, `loose-furniture`, `lighting`, `finishes`, `appliances`, `ffe`, `electrical`, `plumbing`, `hvac`, `low-voltage`, `fire-protection`, `sanitary` | Vedi enum `boq_category` |
| `subcategory` | sì | `LF`, `LT`, `JN`, `DR`, `FL`, `CL`, `WF`, `SK`, `KA`, `TV`, `OA`, `WS`, `CL`, `DL`, `TL`, `WL` | 2 lettere |
| `type_mark` | sì | `LF12`, `J08`, `TL1`, `KA1` | Codice univoco Revit per tipo |
| `description` | sì | `Diver executive desk` | Senza il supplier tra parentesi |
| `supplier` | no | `Bonaldo` | Estratto dal testo Revit "( ... )" |
| `quantity` | sì | `1`, `2`, `211.90` | Numero pezzi o metri quadri |
| `unit` | sì | `pcs`, `m²`, `m`, `set` | Unità di misura |
| `width_cm` | no | `258` | Larghezza in cm |
| `depth_cm` | no | `135` | Profondità in cm |
| `height_cm` | no | `75` | Altezza in cm |
| `length_m` | no | `34.05` | Solo per skirting/profili lineari |
| `material_top` | no | `Walnut Canaletto veneer` | Materiale top (Loose Furniture) |
| `material_base` | no | `Bronze opaque metal` | Materiale base |
| `finish` | no | `Black matt` | Finitura aggiuntiva |
| `reference_image_url` | no | `https://drive.google.com/...` | URL pubblico immagine di riferimento |
| `notes` | no | testo libero | Per appunti |

## Mappatura Subcategory consigliata

- **Joinery (JN)**: `J##` Wall Cabinet, TV Cabinet, Pantry, Shelves
- **Doors (DR)**: `GD#`, `D#` (sotto `category=joinery`)
- **Loose Furniture (LF)**: `LF##`
- **Lighting**: `TL#` track linear, `DL#` downlight, `CL#` chandelier, `WL#` wall light
- **Finishes**: `FL` floor (`AF`, `ST`), `CL` ceiling/cladding, `WF` wall paint, `SK` skirting
- **Appliances**: `KA#` kitchen, `TV#` television
- **Office Equipment**: `OA#` (sotto `category=ffe`)
- **Workstations PC**: `EL` (sotto `category=electrical`)

## Regole di import

1. **Dedup**: chiave `(project_code, type_mark, room_number)` — re-import aggiorna gli item esistenti, non duplica.
2. **Stanze**: se `room_type=All` e `room_number=00`, l'item è considerato "whole project" (tipico per finishes).
3. **Validazione**: righe con `category` o `subcategory` non valida vengono rifiutate con messaggio in preview.
4. **Default**: tutti gli item importati partono con `lifecycle_status=draft` e `approval_status=pending`.

## Workflow consigliato per il design team

1. In Revit, esportare ogni Schedule in Excel (come fai oggi).
2. Aprire un Google Sheet con la testata di questo template.
3. Per ogni schedule, copiare le righe nel template usando le mappature sopra.
4. Estrarre il supplier dalle parentesi del campo "Specification" e metterlo nella colonna `supplier`.
5. Aggiungere link pubblici alle immagini di riferimento (Drive, Dropbox, ecc.).
6. Esportare il Sheet come **CSV (UTF-8)** e caricarlo in StudioScope → Project → BOQ Analyst → Import CSV.

In futuro questo step manuale verrà sostituito da un **plugin Revit** che genererà il CSV automaticamente.
