import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-site-api-key",
};

const MIGRATION_SQL = /* sql */ `
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
`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const key = req.headers.get("x-site-api-key");
  if (!key || key !== Deno.env.get("SITE_API_KEY")) {
    return json({ error: "forbidden" }, 403);
  }

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  try {
    await sql.unsafe(MIGRATION_SQL);
    return json({ ok: true, message: "SSO tickets migration applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
