CREATE OR REPLACE FUNCTION public.project_budget_estimate(_project_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public.user_can_see_project_costs(auth.uid(), _project_id)
    THEN (SELECT p.budget_estimate FROM public.projects p WHERE p.id = _project_id)
    ELSE NULL
  END
$$;

REVOKE EXECUTE ON FUNCTION public.project_budget_estimate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_budget_estimate(uuid) TO authenticated, service_role;

DROP VIEW IF EXISTS public.projects_safe;
CREATE VIEW public.projects_safe
WITH (security_invoker = on) AS
SELECT
  p.id, p.owner_id, p.code, p.name, p.client, p.location,
  p.start_date, p.target_completion_date, p.boq_master_ref, p.boq_version,
  p.last_update_date, p.project_manager, p.created_at, p.updated_at,
  p.organization_id, p.archived_at, p.archived_by, p.project_type,
  public.project_budget_estimate(p.id) AS budget_estimate,
  p.setup_dismissed_at
FROM public.projects p;

GRANT SELECT ON public.projects_safe TO authenticated;