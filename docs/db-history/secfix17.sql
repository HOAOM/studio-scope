-- Archived from edge function run-migration-secfix17 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

-- 1) Funzione trigger SECURITY DEFINER non piu' invocabile via API
REVOKE EXECUTE ON FUNCTION public.guard_complimentary_flag() FROM anon, authenticated, PUBLIC;

-- 2) item-files: la lettura non dipende piu' da un ruolo "admin" di studio
DROP POLICY IF EXISTS "Authenticated read item files" ON storage.objects;
CREATE POLICY "Authenticated read item files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'item-files'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.user_id = auth.uid()
        AND (pm.project_id)::text = (storage.foldername(objects.name))[1]
    )
  )
);

-- 3) completion_fields delle attivita': scrittura limitata ai ruoli operativi
CREATE OR REPLACE FUNCTION public.guard_task_completion_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.completion_fields IS DISTINCT FROM OLD.completion_fields THEN
    IF NOT (
      public.is_project_owner(NEW.project_id)
      OR public.is_project_org_admin(NEW.project_id)
      OR public.is_platform_admin(auth.uid())
      OR NEW.assignee_id = auth.uid()
      OR OLD.assignee_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Non autorizzato a modificare i campi di completamento di questa attivita';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.guard_task_completion_fields() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_task_completion_fields ON public.project_tasks;
CREATE TRIGGER trg_guard_task_completion_fields
BEFORE UPDATE ON public.project_tasks
FOR EACH ROW EXECUTE FUNCTION public.guard_task_completion_fields();

-- 4) un ruolo puo' essere assegnato solo a un membro reale di quella organizzazione
CREATE OR REPLACE FUNCTION public.guard_user_role_target_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = NEW.organization_id
      AND om.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Utente non membro di questa organizzazione';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.guard_user_role_target_membership() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_user_role_target_membership ON public.user_roles;
CREATE TRIGGER trg_guard_user_role_target_membership
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_user_role_target_membership();

COMMIT;

