CREATE OR REPLACE FUNCTION public.is_team_lead_of(_actor uuid, _target uuid, _org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members lead
    JOIN public.team_members mem
      ON mem.team_id = lead.team_id
     AND mem.organization_id = lead.organization_id
    WHERE lead.user_id = _actor
      AND lead.member_role = 'lead'::public.team_member_role
      AND mem.user_id = _target
      AND lead.organization_id = _org
      AND (lead.valid_from IS NULL OR lead.valid_from <= CURRENT_DATE)
      AND (lead.valid_to   IS NULL OR lead.valid_to   >= CURRENT_DATE)
      AND (mem.valid_from  IS NULL OR mem.valid_from  <= CURRENT_DATE)
      AND (mem.valid_to    IS NULL OR mem.valid_to    >= CURRENT_DATE)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_direct_manager_of(_actor uuid, _target uuid, _org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_positions mgr
    JOIN public.org_positions rep
      ON rep.manager_id = mgr.id
     AND rep.organization_id = mgr.organization_id
    WHERE mgr.user_id = _actor
      AND rep.user_id = _target
      AND mgr.organization_id = _org
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_member(_actor uuid, _target uuid, _org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _actor IS NOT NULL AND _target IS NOT NULL AND _org IS NOT NULL AND (
    -- amministratore / owner dell'organizzazione
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = _org AND om.user_id = _actor AND om.is_owner
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _actor AND ur.organization_id = _org
        AND ur.role = 'admin'::public.app_role
    )
    -- responsabile diretto in organigramma (deep = false)
    OR public.is_direct_manager_of(_actor, _target, _org)
    -- caposquadra di una squadra a cui appartiene il target
    OR public.is_team_lead_of(_actor, _target, _org)
  )
$$;

REVOKE ALL ON FUNCTION public.is_team_lead_of(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_direct_manager_of(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_member(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_member(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_team_lead_of(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_direct_manager_of(uuid, uuid, uuid) TO authenticated, service_role;

-- ── calendar_entries: scrittura estesa a manager diretti e capisquadra ──
DROP POLICY IF EXISTS calendar_insert_self_or_admin ON public.calendar_entries;
CREATE POLICY calendar_insert_self_or_admin
ON public.calendar_entries FOR INSERT TO authenticated
WITH CHECK (
  is_org_admin(organization_id)
  OR is_platform_admin()
  OR (
    is_org_member(organization_id)
    AND user_id = auth.uid()
    AND created_by = auth.uid()
    AND status = 'requested'::calendar_entry_status
  )
  OR (
    is_org_member(organization_id)
    AND user_id IS NOT NULL
    AND created_by = auth.uid()
    AND public.can_manage_member(auth.uid(), user_id, organization_id)
  )
);

DROP POLICY IF EXISTS calendar_update_self_pending_or_admin ON public.calendar_entries;
CREATE POLICY calendar_update_self_pending_or_admin
ON public.calendar_entries FOR UPDATE TO authenticated
USING (
  is_org_admin(organization_id)
  OR is_platform_admin()
  OR (user_id = auth.uid() AND status = 'requested'::calendar_entry_status)
  OR (user_id IS NOT NULL AND public.can_manage_member(auth.uid(), user_id, organization_id))
)
WITH CHECK (
  is_org_admin(organization_id)
  OR is_platform_admin()
  OR (user_id = auth.uid() AND status = ANY (ARRAY['requested'::calendar_entry_status, 'cancelled'::calendar_entry_status]))
  OR (user_id IS NOT NULL AND public.can_manage_member(auth.uid(), user_id, organization_id))
);

DROP POLICY IF EXISTS calendar_delete_self_pending_or_admin ON public.calendar_entries;
CREATE POLICY calendar_delete_self_pending_or_admin
ON public.calendar_entries FOR DELETE TO authenticated
USING (
  is_org_admin(organization_id)
  OR is_platform_admin()
  OR (user_id = auth.uid() AND status = 'requested'::calendar_entry_status)
  OR (user_id IS NOT NULL AND public.can_manage_member(auth.uid(), user_id, organization_id))
);

-- ── team_members: i lead gestiscono i membri della propria squadra ──
DROP POLICY IF EXISTS team_members_write_admin ON public.team_members;
CREATE POLICY team_members_write_admin
ON public.team_members FOR ALL TO authenticated
USING (
  is_org_admin(organization_id)
  OR is_platform_admin()
  OR (
    is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.team_members lead
      WHERE lead.team_id = team_members.team_id
        AND lead.user_id = auth.uid()
        AND lead.member_role = 'lead'::public.team_member_role
    )
  )
)
WITH CHECK (
  is_org_admin(organization_id)
  OR is_platform_admin()
  OR (
    is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.team_members lead
      WHERE lead.team_id = team_members.team_id
        AND lead.user_id = auth.uid()
        AND lead.member_role = 'lead'::public.team_member_role
    )
  )
);