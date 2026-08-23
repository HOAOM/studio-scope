-- Archived from edge function run-migration-secfix16 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

-- Contrassegno "creato in eccedenza rispetto al limite del piano",
-- concettualmente distinto dall'omaggio deciso dal super-admin.
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS is_over_tier_limit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS over_tier_by uuid,
  ADD COLUMN IF NOT EXISTS over_tier_at timestamptz;

ALTER TABLE public.organization_invites
  ADD COLUMN IF NOT EXISTS is_over_tier_limit boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.org_seat_count(p_org uuid, p_include_invites boolean DEFAULT true)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    (SELECT count(DISTINCT m.user_id) FROM public.organization_members m
      WHERE m.organization_id = p_org AND m.is_complimentary = false
        AND m.is_over_tier_limit = false)::int
  + CASE WHEN p_include_invites THEN (
      SELECT count(DISTINCT lower(i.email)) FROM public.organization_invites i
      WHERE i.organization_id = p_org
        AND i.status = 'pending'
        AND i.is_complimentary = false
        AND i.is_over_tier_limit = false
        AND i.expires_at > now()
        AND NOT EXISTS (
          SELECT 1 FROM public.organization_members m2
          JOIN public.profiles p ON p.id = m2.user_id
          WHERE m2.organization_id = p_org AND lower(p.email) = lower(i.email)
        )
    )::int ELSE 0 END
$fn$;

CREATE OR REPLACE FUNCTION public.org_role_user_count(p_org uuid, p_role public.app_role)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT count(DISTINCT ur.user_id)::int
  FROM public.user_roles ur
  WHERE ur.organization_id = p_org
    AND ur.role = p_role
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = p_org
        AND m.user_id = ur.user_id
        AND (m.is_complimentary = true OR m.is_over_tier_limit = true)
    )
$fn$;

REVOKE EXECUTE ON FUNCTION public.org_seat_count(uuid, boolean) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.org_role_user_count(uuid, public.app_role) FROM authenticated, anon;

-- Il guard esistente copre ora anche il contrassegno di eccedenza
CREATE OR REPLACE FUNCTION public.guard_complimentary_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_complimentary, false) THEN
      RAISE EXCEPTION 'Solo lo staff di piattaforma puo'' creare utenti omaggio fuori tier'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF COALESCE(NEW.is_over_tier_limit, false) THEN
      RAISE EXCEPTION 'Solo lo staff di piattaforma puo'' creare utenti in eccedenza rispetto al piano'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.is_complimentary, false) IS DISTINCT FROM COALESCE(OLD.is_complimentary, false) THEN
      RAISE EXCEPTION 'Solo lo staff di piattaforma puo'' modificare il contrassegno omaggio'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF COALESCE(NEW.is_over_tier_limit, false) IS DISTINCT FROM COALESCE(OLD.is_over_tier_limit, false) THEN
      RAISE EXCEPTION 'Solo lo staff di piattaforma puo'' modificare il contrassegno di eccedenza'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.guard_complimentary_flag() FROM authenticated, anon;

-- L'accettazione invito propaga anche il contrassegno di eccedenza
CREATE OR REPLACE FUNCTION public.accept_org_invite(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_inv public.organization_invites%ROWTYPE;
  v_uid uuid := auth.uid();
  v_email text;
  v_role public.app_role;
  v_inviter_owner boolean := false;
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

  INSERT INTO public.organization_members (organization_id, user_id, is_owner,
                                           is_complimentary, complimentary_reason,
                                           complimentary_by, complimentary_at,
                                           is_over_tier_limit, over_tier_by, over_tier_at)
  VALUES (v_inv.organization_id, v_uid, v_inv.is_owner,
          COALESCE(v_inv.is_complimentary, false), v_inv.complimentary_reason,
          CASE WHEN v_inv.is_complimentary THEN v_inv.invited_by END,
          CASE WHEN v_inv.is_complimentary THEN now() END,
          COALESCE(v_inv.is_over_tier_limit, false),
          CASE WHEN v_inv.is_over_tier_limit THEN v_inv.invited_by END,
          CASE WHEN v_inv.is_over_tier_limit THEN now() END)
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  BEGIN
    v_role := v_inv.base_role::public.app_role;
  EXCEPTION WHEN others THEN
    v_role := NULL;
  END;

  IF v_role IS NOT NULL THEN
    SELECT COALESCE(bool_or(om.is_owner), false) OR public.is_platform_admin(v_inv.invited_by)
      INTO v_inviter_owner
      FROM public.organization_members om
     WHERE om.organization_id = v_inv.organization_id
       AND om.user_id = v_inv.invited_by;

    IF v_role <> 'admin'::public.app_role OR v_inviter_owner THEN
      INSERT INTO public.user_roles (user_id, role, organization_id)
      VALUES (v_uid, v_role, v_inv.organization_id)
      ON CONFLICT (user_id, role, organization_id) DO NOTHING;
    END IF;
  END IF;

  UPDATE public.organization_invites
     SET status='accepted', accepted_at=now(), accepted_by=v_uid
   WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'organization_id', v_inv.organization_id,
                            'role', v_role);
END;
$fn$;

COMMIT;

