CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  country text,
  city text,
  categories text[] NOT NULL DEFAULT '{}',
  rating int NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin_delete_suppliers" ON public.suppliers FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.supplier_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  author_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.supplier_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_supplier_comments" ON public.supplier_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_supplier_comments" ON public.supplier_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "authors_delete_supplier_comments" ON public.supplier_comments FOR DELETE TO authenticated USING (author_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_supplier_comments_supplier_id ON public.supplier_comments(supplier_id);
