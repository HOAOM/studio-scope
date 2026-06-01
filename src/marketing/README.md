# ⚠️ NON USARE IN QUESTO PROGETTO

Questi file appartengono al **Progetto B — Sito + Onboarding**, un progetto Lovable
separato (entità distinta ma connessa a questo software).

## Stato attuale
- Questi componenti NON sono importati né instradati in questo progetto.
- `/` resta la dashboard del gestionale. Nessuna rotta pubblica è attiva qui.
- Sono conservati solo come base da **copiare** nel Progetto B.

## Architettura decisa
- **Progetto A (questo)** = software gestionale + database (organizations,
  organization_subscriptions, referral_codes, discount_codes, ...).
- **Progetto B** = sito cinematografico + onboarding, frontend "puro".
- **Connessione**: backend condiviso. Il Progetto B chiama via HTTPS l'edge
  function pubblica di questo progetto (`supabase/functions/public-onboarding`)
  per creare org/abbonamenti. Unica sorgente dati.

## File da portare nel Progetto B
- `Landing.tsx` — landing scrollytelling (7 capitoli)
- `Scene3D.tsx` — scena 3D (three / @react-three/fiber / drei)
- `tiers.ts` — definizione tier allineata al DB del Progetto A

## Deploy VPS (DigitalOcean)
Da decidere in seguito. Nota: Lovable Cloud (DB/auth/edge functions) è gestito e
NON si sposta sulla VPS senza self-hosting manuale di Supabase.
