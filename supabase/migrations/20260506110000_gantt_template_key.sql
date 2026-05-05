ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS template_key text;

CREATE INDEX IF NOT EXISTS idx_project_tasks_template_key
  ON public.project_tasks(project_id, linked_item_id, template_key);
