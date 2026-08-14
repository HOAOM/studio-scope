/**
 * run-migration-tier-limits — enforcement server-side dei limiti di piano.
 *
 * 1. Tabella di configurazione `public.tier_limits` (una riga per tier),
 *    leggibile da tutti gli utenti autenticati e scrivibile SOLO dai
 *    platform admin. NULL = illimitato.
 * 2. Helper: public.get_tier_limits(org), public.org_seat_count(org),
 *    public.org_storage_bytes(org), public.project_boq_item_count(project).
 * 3. Trigger BEFORE INSERT su organization_members, organization_invites,
 *    projects, project_items.
 * 4. Storage: le policy INSERT su storage.objects (item-files, secure-docs)
 *    includono il controllo di quota via public.storage_upload_within_limit().
 * 5. Bypass completo per i platform admin (staff/owner).
 *
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

-- =====================================================================
-- 1. Tabella di configurazione dei limiti
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tier_limits (
  tier                      public.subscription_tier PRIMARY KEY,
  max_seats                 integer,
  max_active_projects       integer,
  max_boq_items_per_project integer,
  max_storage_bytes         bigint,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid
);

GRANT SELECT ON public.tier_limits TO authenticated;
GRANT ALL    ON public.tier_limits TO service_role;

ALTER TABLE public.tier_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tier_limits_read           ON public.tier_limits;
DROP POLICY IF EXISTS tier_limits_platform_write ON public.tier_limits;

CREATE POLICY tier_limits_read ON public.tier_limits
  FOR SELECT TO authenticated USING (true);

CREATE POLICY tier_limits_platform_write ON public.tier_limits
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

GRANT INSERT, UPDATE, DELETE ON public.tier_limits TO authenticated;

INSERT INTO public.tier_limits
  (tier, max_seats, max_active_projects, max_boq_items_per_project, max_storage_bytes)
VALUES
  ('starter',   5,    2,    500,  2  * 1024^3),
  ('pro',       20,   8,    5000, 10 * 1024^3),
  ('business',  NULL, NULL, NULL, NULL)
ON CONFLICT (tier) DO NOTHING;

-- =====================================================================
-- 2. Helper di conteggio
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_tier_limits(p_org uuid)
RETURNS public.tier_limits
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT l.* FROM public.tier_limits l
  WHERE l.tier = public.get_org_effective_tier(p_org)
$fn$;

CREATE OR REPLACE FUNCTION public.org_seat_count(p_org uuid, p_include_invites boolean DEFAULT true)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    (SELECT count(DISTINCT m.user_id) FROM public.organization_members m
      WHERE m.organization_id = p_org)::int
  + CASE WHEN p_include_invites THEN (
      SELECT count(DISTINCT lower(i.email)) FROM public.organization_invites i
      WHERE i.organization_id = p_org
        AND i.status = 'pending'
        AND i.expires_at > now()
        AND NOT EXISTS (
          SELECT 1 FROM public.organization_members m2
          JOIN public.profiles p ON p.id = m2.user_id
          WHERE m2.organization_id = p_org AND lower(p.email) = lower(i.email)
        )
    )::int ELSE 0 END
$fn$;

CREATE OR REPLACE FUNCTION public.project_boq_item_count(p_project uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT count(*)::int FROM public.project_items i
  WHERE i.project_id = p_project AND COALESCE(i.is_active, true)
$fn$;

-- Somma dei byte in item-files + secure-docs attribuiti all'organizzazione
-- (il primo segmento del path e' l'id di progetto).
CREATE OR REPLACE FUNCTION public.org_storage_bytes(p_org uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public, storage'
AS $fn$
  SELECT COALESCE(SUM((o.metadata->>'size')::bigint), 0)::bigint
  FROM storage.objects o
  JOIN public.projects pr
    ON pr.id::text = ANY (
         ARRAY[(storage.foldername(o.name))[1], (storage.foldername(o.name))[2]]
       )
  WHERE o.bucket_id IN ('item-files','secure-docs')
    AND pr.organization_id = p_org
$fn$;

CREATE OR REPLACE FUNCTION public.storage_upload_within_limit(p_bucket text, p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public, storage'
AS $fn$
DECLARE
  v_project uuid;
  v_org     uuid;
  v_limit   bigint;
BEGIN
  IF public.is_platform_admin(auth.uid()) THEN RETURN true; END IF;
  IF p_bucket NOT IN ('item-files','secure-docs') THEN RETURN true; END IF;

  -- il path puo' essere '{project_id}/...' oppure '{user_id}/{project_id}/...'
  SELECT pr.id, pr.organization_id INTO v_project, v_org
  FROM public.projects pr
  WHERE pr.id::text = ANY (
    ARRAY[(storage.foldername(p_name))[1], (storage.foldername(p_name))[2]]
  )
  LIMIT 1;
  IF v_org IS NULL THEN RETURN true; END IF;

  SELECT max_storage_bytes INTO v_limit FROM public.get_tier_limits(v_org);
  IF v_limit IS NULL THEN RETURN true; END IF;

  RETURN public.org_storage_bytes(v_org) < v_limit;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.my_org_limits_usage(p_org uuid DEFAULT NULL)
RETURNS TABLE (
  organization_id uuid,
  tier public.subscription_tier,
  seats_used integer, max_seats integer,
  projects_used integer, max_active_projects integer,
  storage_used_bytes bigint, max_storage_bytes bigint,
  max_boq_items_per_project integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH org AS (
    SELECT COALESCE(
      p_org,
      (SELECT m.organization_id FROM public.organization_members m
        WHERE m.user_id = auth.uid() ORDER BY m.joined_at ASC LIMIT 1)
    ) AS id
  )
  SELECT
    org.id,
    public.get_org_effective_tier(org.id),
    public.org_seat_count(org.id),
    l.max_seats,
    public.get_org_active_project_count(org.id),
    l.max_active_projects,
    public.org_storage_bytes(org.id),
    l.max_storage_bytes,
    l.max_boq_items_per_project
  FROM org
  LEFT JOIN LATERAL public.get_tier_limits(org.id) l ON true
  WHERE org.id IS NOT NULL
    AND (public.is_org_member(org.id) OR public.is_platform_admin(auth.uid()))
$fn$;

REVOKE ALL ON FUNCTION public.get_tier_limits(uuid)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_seat_count(uuid, boolean)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_boq_item_count(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_storage_bytes(uuid)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.storage_upload_within_limit(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_org_limits_usage(uuid)           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tier_limits(uuid)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_seat_count(uuid, boolean)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_boq_item_count(uuid)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_storage_bytes(uuid)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_upload_within_limit(text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_org_limits_usage(uuid)           TO authenticated, service_role;

-- =====================================================================
-- 3. Trigger: posti (seat)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enforce_org_seat_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_limit integer;
  v_used  integer;
  v_tier  public.subscription_tier;
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  IF public.is_platform_admin(auth.uid()) THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'organization_invites' THEN
    -- invito creato da un platform admin via edge function (service role)
    IF NEW.invited_by IS NOT NULL AND public.is_platform_admin(NEW.invited_by) THEN
      RETURN NEW;
    END IF;
    IF NEW.status IS DISTINCT FROM 'pending' THEN RETURN NEW; END IF;
  END IF;

  v_tier := public.get_org_effective_tier(NEW.organization_id);
  SELECT max_seats INTO v_limit FROM public.get_tier_limits(NEW.organization_id);
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  -- L'accettazione di un invito gia' conteggiato non deve essere bloccata:
  -- sui membri contiamo solo i membri effettivi.
  v_used := public.org_seat_count(NEW.organization_id, TG_TABLE_NAME = 'organization_invites');

  IF v_used >= v_limit THEN
    RAISE EXCEPTION
      'Limite posti raggiunto per il piano % (% / % posti occupati). Serve un upgrade di piano per aggiungere altre persone.',
      v_tier, v_used, v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_seat_limit_members ON public.organization_members;
CREATE TRIGGER trg_seat_limit_members
  BEFORE INSERT ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_org_seat_limit();

DROP TRIGGER IF EXISTS trg_seat_limit_invites ON public.organization_invites;
CREATE TRIGGER trg_seat_limit_invites
  BEFORE INSERT ON public.organization_invites
  FOR EACH ROW EXECUTE FUNCTION public.enforce_org_seat_limit();

-- =====================================================================
-- 4. Trigger: progetti attivi (ora legge da tier_limits)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enforce_project_tier_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_tier  public.subscription_tier;
  v_limit integer;
  v_count integer;
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  IF public.is_platform_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.owner_id IS NOT NULL AND public.is_platform_admin(NEW.owner_id) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.archived_at IS NOT NULL THEN RETURN NEW; END IF;

  v_tier := public.get_org_effective_tier(NEW.organization_id);
  SELECT max_active_projects INTO v_limit FROM public.get_tier_limits(NEW.organization_id);
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  v_count := public.get_org_active_project_count(NEW.organization_id);
  IF v_count >= v_limit THEN
    RAISE EXCEPTION
      'Limite progetti attivi raggiunto per il piano % (% / % progetti). Archivia un progetto o esegui un upgrade di piano.',
      v_tier, v_count, v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

-- =====================================================================
-- 5. Trigger: voci BOQ per progetto
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enforce_boq_item_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_org   uuid;
  v_tier  public.subscription_tier;
  v_limit integer;
  v_count integer;
BEGIN
  IF public.is_platform_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.created_by IS NOT NULL AND public.is_platform_admin(NEW.created_by) THEN RETURN NEW; END IF;

  SELECT organization_id INTO v_org FROM public.projects WHERE id = NEW.project_id;
  IF v_org IS NULL THEN RETURN NEW; END IF;

  v_tier := public.get_org_effective_tier(v_org);
  SELECT max_boq_items_per_project INTO v_limit FROM public.get_tier_limits(v_org);
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  v_count := public.project_boq_item_count(NEW.project_id);
  IF v_count >= v_limit THEN
    RAISE EXCEPTION
      'Limite voci BOQ raggiunto per il piano % (% / % voci su questo progetto). Serve un upgrade di piano per aggiungere altre voci.',
      v_tier, v_count, v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_boq_item_limit ON public.project_items;
CREATE TRIGGER trg_boq_item_limit
  BEFORE INSERT ON public.project_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_boq_item_limit();

COMMIT;

-- =====================================================================
-- 6. Storage: quota su INSERT (fuori transazione: policy su storage.objects)
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated upload own item files" ON storage.objects;
CREATE POLICY "Authenticated upload own item files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'item-files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.user_id = auth.uid()
          AND pm.project_id::text = (storage.foldername(name))[1]
      )
      OR public.is_platform_admin(auth.uid())
    )
    AND public.storage_upload_within_limit(bucket_id, name)
  );

DROP POLICY IF EXISTS secure_docs_insert ON storage.objects;
CREATE POLICY secure_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'secure-docs'
    AND public.can_access_project_file(name)
    AND public.storage_upload_within_limit(bucket_id, name)
  );
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
    return json({ ok: true, message: "tier limits enforcement applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
