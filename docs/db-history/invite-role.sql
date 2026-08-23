-- Archived from edge function run-migration-invite-role (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

CREATE OR REPLACE FUNCTION public.accept_org_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.organization_members (organization_id, user_id, is_owner)
  VALUES (v_inv.organization_id, v_uid, v_inv.is_owner)
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  -- level-1 role (permissions inside the studio)
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
$function$;

REVOKE EXECUTE ON FUNCTION public.accept_org_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_org_invite(text) TO authenticated, service_role;

COMMIT;

