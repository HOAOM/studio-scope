/**
 * run-migration-phase3
 *
 * One-shot, idempotent migrator for Phase 3 — Role label customization.
 *
 * Goal: each organization can rename existing app roles (e.g. "COO" → "Marco")
 * WITHOUT inventing new roles. Permissions/functions remain bound to the
 * fixed app_role enum; only the displayed label per org changes.
 *
 * Creates / ensures:
 *   - unique constraint  (organization_id, base_role) on organization_role_labels
 *   - validation trigger: base_role MUST be a valid app_role enum value
 *   - validation trigger: custom_label non-empty, trimmed, max 60 chars
 *   - helper fn get_role_label(p_org uuid, p_role app_role) → text
 *   - helper fn get_org_role_labels(p_org uuid) → table(base_role, label)
 *     (returns the resolved label for every app_role, custom or default)
 *   - updated_at trigger
 *
 * NO backfill rows are inserted: absence of a row = use the default label.
 *
 * Auth: callable only by an authenticated admin.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

-- 1. Uniqueness: one custom label per (org, base_role) -----------------------
DO $$ BEGIN
  ALTER TABLE public.organization_role_labels
    ADD CONSTRAINT organization_role_labels_org_role_uk
    UNIQUE (organization_id, base_role);
EXCEPTION WHEN duplicate_object THEN NULL;
         WHEN duplicate_table  THEN NULL; END $$;

-- 2. Validation trigger ------------------------------------------------------
-- Enforces:
--   - base_role must be a valid app_role enum value (blocks fake new roles)
--   - custom_label trimmed, non-empty, max 60 chars
CREATE OR REPLACE FUNCTION public.validate_org_role_label()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_label text;
BEGIN
  -- base_role must exist in app_role enum
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = NEW.base_role
  ) THEN
    RAISE EXCEPTION 'invalid base_role %, must be an existing app_role', NEW.base_role
      USING ERRCODE = '22023';
  END IF;

  v_label := btrim(coalesce(NEW.custom_label, ''));
  IF v_label = '' THEN
    RAISE EXCEPTION 'custom_label cannot be empty' USING ERRCODE = '22023';
  END IF;
  IF length(v_label) > 60 THEN
    RAISE EXCEPTION 'custom_label too long (max 60 chars)' USING ERRCODE = '22023';
  END IF;
  NEW.custom_label := v_label;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_org_role_label ON public.organization_role_labels;
CREATE TRIGGER trg_validate_org_role_label
  BEFORE INSERT OR UPDATE ON public.organization_role_labels
  FOR EACH ROW EXECUTE FUNCTION public.validate_org_role_label();

-- 3. updated_at trigger ------------------------------------------------------
DROP TRIGGER IF EXISTS trg_org_role_labels_updated_at ON public.organization_role_labels;
CREATE TRIGGER trg_org_role_labels_updated_at
  BEFORE UPDATE ON public.organization_role_labels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Helper: resolved label for a single role --------------------------------
CREATE OR REPLACE FUNCTION public.get_role_label(p_org uuid, p_role public.app_role)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT custom_label
       FROM public.organization_role_labels
      WHERE organization_id = p_org AND base_role = p_role::text),
    -- default: prettify enum value (e.g. project_manager → Project Manager)
    initcap(replace(p_role::text, '_', ' '))
  )
$$;

-- 5. Helper: full resolved label map for an org ------------------------------
CREATE OR REPLACE FUNCTION public.get_org_role_labels(p_org uuid)
RETURNS TABLE(base_role text, label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    r::text AS base_role,
    coalesce(
      (SELECT custom_label FROM public.organization_role_labels
        WHERE organization_id = p_org AND base_role = r::text),
      initcap(replace(r::text, '_', ' '))
    ) AS label
  FROM unnest(enum_range(NULL::public.app_role)) AS r
$$;

COMMIT;
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // --- Auth: admin only -----------------------------------------------------
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "missing Authorization header" }, 401);
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: "unauthenticated" }, 401);
  }
  const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleErr || !isAdmin) {
    return json({ error: "forbidden: admin only" }, 403);
  }

  // --- Execute migration ----------------------------------------------------
  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, {
    prepare: false,
    max: 1,
  });
  try {
    await sql.unsafe(MIGRATION_SQL);

    // Sanity check: list the available roles + any existing custom labels
    const roles =
      await sql`SELECT base_role, label FROM public.get_org_role_labels(
        (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1)
      ) ORDER BY base_role`;
    const customs =
      await sql`SELECT organization_id, base_role, custom_label
                  FROM public.organization_role_labels
                 ORDER BY organization_id, base_role`;

    return json({
      ok: true,
      phase: 3,
      message: "Phase 3 migration complete",
      roles_default_for_first_org: roles,
      existing_custom_labels: customs,
    });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
