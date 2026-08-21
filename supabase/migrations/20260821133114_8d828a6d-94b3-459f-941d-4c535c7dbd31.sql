CREATE OR REPLACE FUNCTION public.org_chart_scope(p_org uuid)
RETURNS TABLE(
  id uuid,
  organization_id uuid,
  title text,
  user_id uuid,
  team_id uuid,
  manager_id uuid,
  base_role public.app_role,
  x numeric,
  y numeric,
  sort_order integer,
  notes text,
  is_ancestor boolean,
  can_edit boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_org IS NULL OR NOT (public.is_org_member(p_org) OR public.is_platform_admin()) THEN
    RETURN;
  END IF;

  IF public.is_org_admin(p_org) OR public.is_platform_admin() THEN
    RETURN QUERY
      SELECT p.id, p.organization_id, p.title, p.user_id, p.team_id, p.manager_id,
             p.base_role, p.x, p.y, p.sort_order, p.notes,
             false AS is_ancestor, true AS can_edit
      FROM public.org_positions p
      WHERE p.organization_id = p_org;
    RETURN;
  END IF;

  RETURN QUERY
  WITH RECURSIVE mine AS (
    SELECT p.id
    FROM public.org_positions p
    WHERE p.organization_id = p_org AND p.user_id = auth.uid()
  ),
  up AS (
    SELECT p.id, p.manager_id
    FROM public.org_positions p
    JOIN mine m ON m.id = p.id
    UNION ALL
    SELECT q.id, q.manager_id
    FROM public.org_positions q
    JOIN up u ON q.id = u.manager_id
    WHERE q.organization_id = p_org
  ),
  sub AS (
    SELECT r.id
    FROM mine m
    CROSS JOIN LATERAL public.org_reports(m.id, true) r
  ),
  visible AS (
    SELECT id, true AS in_sub FROM sub
    UNION
    SELECT id, false FROM up
  ),
  merged AS (
    SELECT v.id, bool_or(v.in_sub) AS in_sub
    FROM visible v
    GROUP BY v.id
  )
  SELECT p.id, p.organization_id, p.title, p.user_id, p.team_id, p.manager_id,
         p.base_role, p.x, p.y, p.sort_order, p.notes,
         (NOT mg.in_sub) AS is_ancestor,
         (mg.in_sub
          AND p.user_id IS NOT NULL
          AND public.can_manage_member(auth.uid(), p.user_id, p_org)) AS can_edit
  FROM merged mg
  JOIN public.org_positions p ON p.id = mg.id
  WHERE p.organization_id = p_org;
END;
$$;

REVOKE ALL ON FUNCTION public.org_chart_scope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_chart_scope(uuid) TO authenticated;