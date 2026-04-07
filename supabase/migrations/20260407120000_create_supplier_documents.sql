CREATE TABLE public.supplier_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier text NOT NULL,
  document_type text NOT NULL DEFAULT 'rfq',
  items jsonb DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid,
  notes text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners_manage_supplier_docs" ON public.supplier_documents
  FOR ALL TO authenticated
  USING (is_project_owner(project_id))
  WITH CHECK (is_project_owner(project_id));

CREATE POLICY "members_view_supplier_docs" ON public.supplier_documents
  FOR SELECT TO authenticated
  USING (is_project_member(project_id));

CREATE TRIGGER update_supplier_documents_updated_at
  BEFORE UPDATE ON public.supplier_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
