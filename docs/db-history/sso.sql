-- Archived from edge function run-migration-sso (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

-- Ticket monouso per l'handoff SSO dal sito Kroneel all'app Studio Scope.
CREATE TABLE IF NOT EXISTS public.sso_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash      text NOT NULL UNIQUE,
  user_id         uuid NOT NULL,
  organization_id uuid NOT NULL,
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sso_tickets_expires_idx ON public.sso_tickets (expires_at);

-- Log dei tentativi di redeem falliti (audit/abuse).
CREATE TABLE IF NOT EXISTS public.sso_redeem_failures (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason     text NOT NULL,
  token_hash text,
  ip         text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Nessun accesso via Data API: solo service_role (edge function).
REVOKE ALL ON public.sso_tickets          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.sso_redeem_failures  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sso_tickets           TO service_role;
GRANT ALL ON public.sso_redeem_failures   TO service_role;

ALTER TABLE public.sso_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sso_redeem_failures ENABLE ROW LEVEL SECURITY;

COMMIT;

