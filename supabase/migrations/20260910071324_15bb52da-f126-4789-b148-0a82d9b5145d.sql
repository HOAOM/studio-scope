
-- 1. Helpers ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.item_org(_item_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.organization_id
  FROM public.project_items pi
  JOIN public.projects p ON p.id = pi.project_id
  WHERE pi.id = _item_id
$$;

CREATE OR REPLACE FUNCTION public.can_act_item_role(_item_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin()
    OR public.is_org_owner(public.item_org(_item_id))
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.organization_id = public.item_org(_item_id)
        AND (ur.role = _role OR ur.role IN ('admin'::public.app_role, 'coo'::public.app_role))
    )
$$;

CREATE OR REPLACE FUNCTION public.checkpoint_write_allowed(
  _item uuid, _def uuid,
  _status public.checkpoint_instance_status,
  _completed_by uuid, _second uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_access_item(_item)
    AND (
      _status = 'pending'::public.checkpoint_instance_status
      OR (
        public.can_act_item_role(
          _item,
          (SELECT cd.ruolo_responsabile FROM public.checkpoint_definitions cd WHERE cd.id = _def)
        )
        -- segregation of duties: the second approver can never be the completer
        AND (_second IS NULL OR _second IS DISTINCT FROM COALESCE(_completed_by, auth.uid()))
        AND (_second IS NULL OR _second = auth.uid() OR public.is_platform_admin())
      )
    )
$$;

GRANT EXECUTE ON FUNCTION public.item_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_act_item_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_write_allowed(uuid, uuid, public.checkpoint_instance_status, uuid, uuid) TO authenticated;

-- 2. checkpoint_instances ---------------------------------------------------
DROP POLICY IF EXISTS "item scope manages checkpoint instances" ON public.checkpoint_instances;

CREATE POLICY "item scope reads checkpoint instances"
  ON public.checkpoint_instances FOR SELECT TO authenticated
  USING (public.can_access_item(project_item_id));

CREATE POLICY "responsible role inserts checkpoint instances"
  ON public.checkpoint_instances FOR INSERT TO authenticated
  WITH CHECK (public.checkpoint_write_allowed(project_item_id, definition_id, status, completed_by, second_approver_id));

CREATE POLICY "responsible role updates checkpoint instances"
  ON public.checkpoint_instances FOR UPDATE TO authenticated
  USING (public.can_access_item(project_item_id))
  WITH CHECK (public.checkpoint_write_allowed(project_item_id, definition_id, status, completed_by, second_approver_id));

CREATE POLICY "responsible role deletes checkpoint instances"
  ON public.checkpoint_instances FOR DELETE TO authenticated
  USING (
    public.can_access_item(project_item_id)
    AND public.can_act_item_role(
      project_item_id,
      (SELECT cd.ruolo_responsabile FROM public.checkpoint_definitions cd WHERE cd.id = definition_id)
    )
  );

-- 3. NCR / RFI / Submittal --------------------------------------------------
DROP POLICY IF EXISTS "item scope manages ncrs" ON public.item_ncrs;
DROP POLICY IF EXISTS "item scope manages rfis" ON public.item_rfis;
DROP POLICY IF EXISTS "item scope manages submittals" ON public.item_submittals;

CREATE POLICY "item scope reads ncrs" ON public.item_ncrs FOR SELECT TO authenticated
  USING (public.can_access_item(project_item_id));
CREATE POLICY "item scope opens ncrs" ON public.item_ncrs FOR INSERT TO authenticated
  WITH CHECK (public.can_access_item(project_item_id));
CREATE POLICY "responsible role updates ncrs" ON public.item_ncrs FOR UPDATE TO authenticated
  USING (public.can_access_item(project_item_id) AND public.can_act_item_role(project_item_id, 'site_engineer'::public.app_role))
  WITH CHECK (public.can_access_item(project_item_id) AND public.can_act_item_role(project_item_id, 'site_engineer'::public.app_role));
CREATE POLICY "responsible role deletes ncrs" ON public.item_ncrs FOR DELETE TO authenticated
  USING (public.can_access_item(project_item_id) AND public.can_act_item_role(project_item_id, 'site_engineer'::public.app_role));

CREATE POLICY "item scope reads rfis" ON public.item_rfis FOR SELECT TO authenticated
  USING (public.can_access_item(project_item_id));
CREATE POLICY "item scope opens rfis" ON public.item_rfis FOR INSERT TO authenticated
  WITH CHECK (public.can_access_item(project_item_id));
CREATE POLICY "responsible role updates rfis" ON public.item_rfis FOR UPDATE TO authenticated
  USING (public.can_access_item(project_item_id) AND public.can_act_item_role(project_item_id, 'client'::public.app_role))
  WITH CHECK (public.can_access_item(project_item_id) AND public.can_act_item_role(project_item_id, 'client'::public.app_role));
CREATE POLICY "responsible role deletes rfis" ON public.item_rfis FOR DELETE TO authenticated
  USING (public.can_access_item(project_item_id) AND public.can_act_item_role(project_item_id, 'client'::public.app_role));

CREATE POLICY "item scope reads submittals" ON public.item_submittals FOR SELECT TO authenticated
  USING (public.can_access_item(project_item_id));
CREATE POLICY "item scope opens submittals" ON public.item_submittals FOR INSERT TO authenticated
  WITH CHECK (public.can_access_item(project_item_id));
CREATE POLICY "responsible role updates submittals" ON public.item_submittals FOR UPDATE TO authenticated
  USING (public.can_access_item(project_item_id) AND public.can_act_item_role(project_item_id, 'head_of_design'::public.app_role))
  WITH CHECK (public.can_access_item(project_item_id) AND public.can_act_item_role(project_item_id, 'head_of_design'::public.app_role));
CREATE POLICY "responsible role deletes submittals" ON public.item_submittals FOR DELETE TO authenticated
  USING (public.can_access_item(project_item_id) AND public.can_act_item_role(project_item_id, 'head_of_design'::public.app_role));

-- 4. organization_domains ---------------------------------------------------
DROP POLICY IF EXISTS "members read own org domains" ON public.organization_domains;
CREATE POLICY "org admins read own org domains"
  ON public.organization_domains FOR SELECT TO authenticated
  USING (public.is_org_admin(organization_id) OR public.is_platform_admin());
