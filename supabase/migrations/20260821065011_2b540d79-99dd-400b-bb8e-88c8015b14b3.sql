CREATE OR REPLACE FUNCTION public.accept_org_invite(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_inv public.organization_invites%ROWTYPE;
  v_uid uuid := auth.uid();
  v_email text;
  v_role public.app_role;
  v_inviter_owner boolean := false;
  v_member_ok boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT * INTO v_inv FROM public.organization_invites WHERE token = p_token FOR UPDATE;
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

  -- Guard di atomicita': l'invito puo' passare ad 'accepted' SOLO se la
  -- membership esiste davvero. Se manca (insert scartata o bloccata da un
  -- trigger di tier limit), si esce con errore e la transazione della
  -- funzione viene annullata: l'invito resta 'pending' e riprovabile.
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
     WHERE organization_id = v_inv.organization_id AND user_id = v_uid
  ) INTO v_member_ok;

  IF NOT v_member_ok THEN
    RAISE EXCEPTION 'membership_not_created';
  END IF;

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