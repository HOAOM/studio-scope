-- Archived from edge function run-migration-secfix18 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

-- 1) DIRECT MESSAGES: mittente e destinatario devono condividere un'organizzazione
CREATE OR REPLACE FUNCTION public.users_share_org(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members ma
    JOIN public.organization_members mb ON mb.organization_id = ma.organization_id
    WHERE ma.user_id = _a AND mb.user_id = _b
  )
$fn$;
REVOKE EXECUTE ON FUNCTION public.users_share_org(uuid, uuid) FROM anon, PUBLIC;

DROP POLICY IF EXISTS users_send_dms ON public.direct_messages;
CREATE POLICY users_send_dms ON public.direct_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.users_share_org(auth.uid(), recipient_id)
);

-- 2) SUPPLIERS: scoping esplicito per organizzazione
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.suppliers s
SET organization_id = om.organization_id
FROM public.organization_members om
WHERE s.organization_id IS NULL
  AND om.user_id = s.created_by
  AND (SELECT count(*) FROM public.organization_members x WHERE x.user_id = s.created_by) = 1;

-- se restano righe ambigue la migrazione si ferma senza indovinare
DO $do$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.suppliers WHERE organization_id IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Fornitori senza organizzazione determinabile: %', n;
  END IF;
END
$do$;

ALTER TABLE public.suppliers ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS suppliers_organization_id_idx ON public.suppliers(organization_id);

DROP POLICY IF EXISTS members_read_suppliers ON public.suppliers;
DROP POLICY IF EXISTS members_insert_suppliers ON public.suppliers;
DROP POLICY IF EXISTS members_update_suppliers ON public.suppliers;
DROP POLICY IF EXISTS admin_delete_suppliers ON public.suppliers;

CREATE POLICY members_read_suppliers ON public.suppliers
FOR SELECT TO authenticated
USING (public.is_org_member(organization_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY members_insert_suppliers ON public.suppliers
FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND public.is_org_member(organization_id));

CREATE POLICY members_update_suppliers ON public.suppliers
FOR UPDATE TO authenticated
USING (public.is_org_member(organization_id) OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_org_member(organization_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY admin_delete_suppliers ON public.suppliers
FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR public.is_org_admin(organization_id)
  OR public.is_platform_admin(auth.uid())
);

-- 3) SUPPLIER COMMENTS: seguono l'organizzazione del fornitore
DROP POLICY IF EXISTS members_read_supplier_comments ON public.supplier_comments;
DROP POLICY IF EXISTS auth_insert_supplier_comments ON public.supplier_comments;

CREATE POLICY members_read_supplier_comments ON public.supplier_comments
FOR SELECT TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = supplier_comments.supplier_id
      AND public.is_org_member(s.organization_id)
  )
);

CREATE POLICY auth_insert_supplier_comments ON public.supplier_comments
FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = supplier_comments.supplier_id
      AND public.is_org_member(s.organization_id)
  )
);

COMMIT;

