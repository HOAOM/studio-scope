ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_type text,
  ADD COLUMN IF NOT EXISTS budget_estimate numeric,
  ADD COLUMN IF NOT EXISTS setup_dismissed_at timestamptz;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_project_type_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_project_type_check
  CHECK (project_type IS NULL OR project_type IN ('residential','commercial','general_contractor'));

CREATE TABLE IF NOT EXISTS public.project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('contract','floor_plan','budget','other')),
  file_name text NOT NULL,
  file_path text NOT NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_documents TO authenticated;
GRANT ALL ON public.project_documents TO service_role;

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project docs select" ON public.project_documents;
CREATE POLICY "Project docs select" ON public.project_documents
  FOR SELECT TO authenticated
  USING (
    public.is_project_member(project_id)
    OR public.is_project_owner(project_id)
    OR public.is_project_in_my_org(project_id)
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Project docs insert" ON public.project_documents;
CREATE POLICY "Project docs insert" ON public.project_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      public.is_project_member(project_id)
      OR public.is_project_owner(project_id)
      OR public.is_project_in_my_org(project_id)
    )
  );

DROP POLICY IF EXISTS "Project docs delete" ON public.project_documents;
CREATE POLICY "Project docs delete" ON public.project_documents
  FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR public.is_project_owner(project_id)
    OR public.is_project_org_admin(project_id)
    OR public.is_platform_admin()
  );

CREATE INDEX IF NOT EXISTS project_documents_project_idx ON public.project_documents(project_id);

DROP TRIGGER IF EXISTS trg_project_documents_updated_at ON public.project_documents;
CREATE TRIGGER trg_project_documents_updated_at
  BEFORE UPDATE ON public.project_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();