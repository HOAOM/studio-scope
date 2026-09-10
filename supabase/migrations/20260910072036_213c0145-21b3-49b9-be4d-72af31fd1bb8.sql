-- 1. Vista protetta dei progetti: budget_estimate visibile solo a chi può vedere i costi
CREATE OR REPLACE VIEW public.projects_safe
WITH (security_invoker = on) AS
SELECT
  p.id, p.owner_id, p.code, p.name, p.client, p.location,
  p.start_date, p.target_completion_date, p.boq_master_ref, p.boq_version,
  p.last_update_date, p.project_manager, p.created_at, p.updated_at,
  p.organization_id, p.archived_at, p.archived_by, p.project_type,
  CASE WHEN public.user_can_see_project_costs(auth.uid(), p.id)
       THEN p.budget_estimate END AS budget_estimate,
  p.setup_dismissed_at
FROM public.projects p;

GRANT SELECT ON public.projects_safe TO authenticated;

-- 2. Sulla tabella base: niente SELECT su budget_estimate per anon/authenticated
REVOKE SELECT ON public.projects FROM authenticated;
REVOKE SELECT ON public.projects FROM anon;

GRANT SELECT (
  id, owner_id, code, name, client, location, start_date, target_completion_date,
  boq_master_ref, boq_version, last_update_date, project_manager, created_at,
  updated_at, organization_id, archived_at, archived_by, project_type,
  setup_dismissed_at
) ON public.projects TO authenticated;

GRANT ALL ON public.projects TO service_role;