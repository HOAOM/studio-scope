/**
 * run-migration-invites — ripristina l'infrastruttura inviti organizzazione.
 *
 * La tabella public.organization_invites non esisteva in database (l'Admin
 * Panel riceveva 404 PGRST205) e mancavano le RPC accept_org_invite /
 * peek_org_invite. Questa migrazione le (ri)crea con i GRANT Data API.
 *
 * NON tocca get_my_organizations, ruoli, assegnazioni progetto o tier.
 * Idempotente. Richiede x-site-api-key.
 */
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-site-api-key",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

CREATE TABLE IF NOT EXISTS public.organization_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  base_role text NOT NULL DEFAULT 'member',
  token text NOT NULL UNIQUE,
  invited_by uuid,
  is_owner boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_invites_org   ON public.organization_invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invites_email ON public.organization_invites(lower(email));
CREATE INDEX IF NOT EXISTS idx_org_invites_token ON public.organization_invites(token);

-- Data API grants (senza anon: il token invito passa dalla RPC peek_org_invite)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_invites TO authenticated;
GRANT ALL ON public.organization_invites TO service_role;

ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners can manage invites" ON public.organization_invites;
CREATE POLICY "owners can manage invites" ON public.organization_invites
  FOR ALL TO authenticated
  USING (public.is_org_owner(organization_id) OR public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.is_org_owner(organization_id) OR public.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "members can view invites" ON public.organization_invites;
CREATE POLICY "members can view invites" ON public.organization_invites
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.has_role(auth.uid(),'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.accept_org_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_inv public.organization_invites%ROWTYPE;
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT * INTO v_inv FROM public.organization_invites WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_not_found');
  END IF;
  IF v_inv.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_'||v_inv.status);
  END IF;
  IF v_inv.expires_at < now() THEN
    UPDATE public.organization_invites SET status='expired' WHERE id = v_inv.id;
    RETURN jsonb_build_object('ok', false, 'error', 'invite_expired');
  END IF;
  IF lower(v_inv.email) <> lower(v_email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch',
      'invite_email', v_inv.email, 'user_email', v_email);
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, is_owner)
  VALUES (v_inv.organization_id, v_uid, v_inv.is_owner)
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  UPDATE public.organization_invites
     SET status='accepted', accepted_at=now(), accepted_by=v_uid
   WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'organization_id', v_inv.organization_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.peek_org_invite(p_token text)
RETURNS TABLE(
  organization_name text,
  email text,
  base_role text,
  status text,
  expires_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT o.name, i.email, i.base_role, i.status, i.expires_at
  FROM public.organization_invites i
  JOIN public.organizations o ON o.id = i.organization_id
  WHERE i.token = p_token;
$fn$;

REVOKE ALL ON FUNCTION public.accept_org_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_org_invite(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.peek_org_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_org_invite(text) TO anon, authenticated, service_role;

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
    const t = await sql`SELECT to_regclass('public.organization_invites') AS t`;
    const fns = await sql`
      SELECT proname FROM pg_proc
      WHERE proname IN ('accept_org_invite','peek_org_invite') ORDER BY proname`;
    return json({ ok: true, table: t[0]?.t, functions: fns });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
