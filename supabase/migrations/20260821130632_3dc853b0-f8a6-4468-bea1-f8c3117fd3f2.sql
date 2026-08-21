CREATE OR REPLACE VIEW public.v_calendar
WITH (security_invoker = true) AS
  SELECT
    ce.id,
    'entry'::text            AS source,
    ce.organization_id,
    ce.project_id,
    ce.task_id,
    ce.user_id                  AS assignee_id,
    ce.team_id,
    ce.supplier_id,
    ce.entry_type::text         AS entry_type,
    ce.status::text             AS status,
    ce.title,
    ce.start_date,
    ce.end_date,
    ce.all_day,
    ce.start_time,
    ce.end_time
  FROM public.calendar_entries ce
  UNION ALL
  SELECT
    pt.id,
    'task'::text                AS source,
    p.organization_id,
    pt.project_id,
    pt.id                       AS task_id,
    pt.assignee_id,
    NULL::uuid                  AS team_id,
    NULL::uuid                  AS supplier_id,
    'work'::text                AS entry_type,
    pt.status::text             AS status,
    pt.title,
    pt.start_date,
    COALESCE(pt.end_date, pt.start_date) AS end_date,
    true                        AS all_day,
    NULL::time                  AS start_time,
    NULL::time                  AS end_time
  FROM public.project_tasks pt
  JOIN public.projects p ON p.id = pt.project_id
  WHERE pt.start_date IS NOT NULL;

GRANT SELECT ON public.v_calendar TO authenticated;
GRANT SELECT ON public.v_calendar TO service_role;