CREATE OR REPLACE FUNCTION public.seed_org_chart_for_org(p_org uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_ceo uuid;
  v_count integer := 0;
  r record;
BEGIN
  IF NOT (public.is_org_admin(p_org) OR public.is_org_owner(p_org) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Not authorized to seed org chart';
  END IF;

  IF EXISTS (SELECT 1 FROM public.org_positions WHERE organization_id = p_org) THEN
    RETURN 0;
  END IF;

  SELECT user_id INTO v_owner
  FROM public.organization_members
  WHERE organization_id = p_org AND is_owner
  ORDER BY joined_at
  LIMIT 1;

  INSERT INTO public.org_positions (organization_id, title, node_kind, user_id, catalog_id, manager_id, sort_order, created_by)
  SELECT p_org, c.title, 'person', v_owner, c.id, NULL, c.sort_order, auth.uid()
  FROM public.position_catalog c
  WHERE c.level = 'L1_L2' AND c.title = 'CEO'
  RETURNING id INTO v_ceo;

  v_count := 1;

  FOR r IN
    SELECT id, title, sort_order
    FROM public.position_catalog
    WHERE level = 'L1_L2'
      AND title IN ('CFO', 'COO', 'Head of Design / Art Director')
    ORDER BY sort_order
  LOOP
    INSERT INTO public.org_positions (organization_id, title, node_kind, catalog_id, manager_id, sort_order, created_by)
    VALUES (p_org, r.title, 'unit', r.id, v_ceo, r.sort_order, auth.uid());
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_org_chart_for_org(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.seed_org_chart_for_org(uuid) TO authenticated, service_role;