-- Archived from edge function run-migration-phase3 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

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

