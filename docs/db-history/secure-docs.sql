-- Archived from edge function run-migration-secure-docs (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

CREATE OR REPLACE FUNCTION public.can_access_project_file(p_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_project uuid;
BEGIN
  BEGIN
    v_project := (split_part(p_name, '/', 1))::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  RETURN public.is_project_in_my_org(v_project)
      OR public.is_project_member(v_project)
      OR public.is_project_owner(v_project)
      OR public.has_role(auth.uid(), 'admin'::public.app_role);
END;
$fn$;

REVOKE ALL   ON FUNCTION public.can_access_project_file(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_project_file(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "secure_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "secure_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "secure_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "secure_docs_delete" ON storage.objects;

CREATE POLICY "secure_docs_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'secure-docs' AND public.can_access_project_file(name));

CREATE POLICY "secure_docs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'secure-docs' AND public.can_access_project_file(name));

CREATE POLICY "secure_docs_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'secure-docs' AND public.can_access_project_file(name))
  WITH CHECK (bucket_id = 'secure-docs' AND public.can_access_project_file(name));

CREATE POLICY "secure_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'secure-docs' AND public.can_access_project_file(name));

COMMIT;

