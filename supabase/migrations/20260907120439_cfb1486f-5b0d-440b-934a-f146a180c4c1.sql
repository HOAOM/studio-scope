-- ============ ENUMS ============
CREATE TYPE public.checkpoint_kind AS ENUM ('automatic','formal');
CREATE TYPE public.checkpoint_instance_status AS ENUM ('pending','completed','skipped');
CREATE TYPE public.rfi_status AS ENUM ('open','answered','closed');
CREATE TYPE public.submittal_status AS ENUM ('proposed','under_review','approved','rework');
CREATE TYPE public.change_request_status AS ENUM ('requested','impact_assessment','approved','rejected','incorporated');

-- ============ SU MISURA ============
ALTER TABLE public.project_items ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false;

-- ============ HELPER ============
CREATE OR REPLACE FUNCTION public.can_access_item(_item_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_items pi
    WHERE pi.id = _item_id
      AND (public.is_project_owner(pi.project_id)
        OR public.is_project_member(pi.project_id)
        OR public.is_project_in_my_org(pi.project_id)
        OR public.is_platform_admin())
  )
$$;
REVOKE EXECUTE ON FUNCTION public.can_access_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_item(uuid) TO authenticated, service_role;

-- ============ CHECKPOINT DEFINITIONS ============
CREATE TABLE public.checkpoint_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  tipo public.checkpoint_kind NOT NULL,
  macro_gruppo public.task_macro_area NOT NULL,
  categorie_applicabili public.boq_category[],
  ruolo_responsabile public.app_role,
  requires_role_count integer NOT NULL DEFAULT 1,
  richiede_documento boolean NOT NULL DEFAULT false,
  skip_level integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.checkpoint_definitions TO authenticated;
GRANT ALL ON public.checkpoint_definitions TO service_role;
ALTER TABLE public.checkpoint_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read checkpoint definitions"
  ON public.checkpoint_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "platform admins manage checkpoint definitions"
  ON public.checkpoint_definitions FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- ============ CHECKPOINT INSTANCES ============
CREATE TABLE public.checkpoint_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_item_id uuid NOT NULL REFERENCES public.project_items(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL REFERENCES public.checkpoint_definitions(id) ON DELETE CASCADE,
  status public.checkpoint_instance_status NOT NULL DEFAULT 'pending',
  completed_by uuid,
  completed_at timestamptz,
  second_approver_id uuid,
  second_approved_at timestamptz,
  sod_warning boolean NOT NULL DEFAULT false,
  skipped_by uuid,
  skipped_at timestamptz,
  skip_reason text,
  document_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_item_id, definition_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkpoint_instances TO authenticated;
GRANT ALL ON public.checkpoint_instances TO service_role;
ALTER TABLE public.checkpoint_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "item scope manages checkpoint instances"
  ON public.checkpoint_instances FOR ALL TO authenticated
  USING (public.can_access_item(project_item_id))
  WITH CHECK (public.can_access_item(project_item_id));
CREATE INDEX idx_checkpoint_instances_item ON public.checkpoint_instances(project_item_id);

-- ============ RFI ============
CREATE TABLE public.item_rfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_item_id uuid NOT NULL REFERENCES public.project_items(id) ON DELETE CASCADE,
  question text NOT NULL,
  opened_by uuid,
  answered_by uuid,
  answer text,
  status public.rfi_status NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_rfis TO authenticated;
GRANT ALL ON public.item_rfis TO service_role;
ALTER TABLE public.item_rfis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "item scope manages rfis"
  ON public.item_rfis FOR ALL TO authenticated
  USING (public.can_access_item(project_item_id))
  WITH CHECK (public.can_access_item(project_item_id));
CREATE INDEX idx_item_rfis_item ON public.item_rfis(project_item_id, status);

-- ============ SUBMITTALS ============
CREATE TABLE public.item_submittals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_item_id uuid NOT NULL REFERENCES public.project_items(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  document_url text,
  status public.submittal_status NOT NULL DEFAULT 'proposed',
  submitted_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_item_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_submittals TO authenticated;
GRANT ALL ON public.item_submittals TO service_role;
ALTER TABLE public.item_submittals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "item scope manages submittals"
  ON public.item_submittals FOR ALL TO authenticated
  USING (public.can_access_item(project_item_id))
  WITH CHECK (public.can_access_item(project_item_id));
CREATE INDEX idx_item_submittals_item ON public.item_submittals(project_item_id, version DESC);

-- storico versioni: mai sovrascrivere un submittal chiuso (approved/rework)
CREATE OR REPLACE FUNCTION public.guard_submittal_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('approved','rework')
     AND (NEW.title IS DISTINCT FROM OLD.title
       OR NEW.document_url IS DISTINCT FROM OLD.document_url
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'Submittal chiuso: creare una nuova versione invece di modificarlo';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.guard_submittal_history() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_guard_submittal_history BEFORE UPDATE ON public.item_submittals
  FOR EACH ROW EXECUTE FUNCTION public.guard_submittal_history();

-- ============ CHANGE / VARIATION ============
CREATE TABLE public.item_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_item_id uuid NOT NULL REFERENCES public.project_items(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  requested_by uuid,
  cost_impact numeric,
  time_impact_days integer,
  impact_notes text,
  status public.change_request_status NOT NULL DEFAULT 'requested',
  approver_role public.app_role,
  approved_by uuid,
  approved_at timestamptz,
  incorporated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_change_requests TO authenticated;
GRANT ALL ON public.item_change_requests TO service_role;
ALTER TABLE public.item_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "item scope manages change requests"
  ON public.item_change_requests FOR ALL TO authenticated
  USING (public.can_access_item(project_item_id))
  WITH CHECK (public.can_access_item(project_item_id));
CREATE INDEX idx_item_change_requests_item ON public.item_change_requests(project_item_id, status);

-- ============ updated_at ============
CREATE TRIGGER trg_checkpoint_definitions_updated BEFORE UPDATE ON public.checkpoint_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_checkpoint_instances_updated BEFORE UPDATE ON public.checkpoint_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_item_rfis_updated BEFORE UPDATE ON public.item_rfis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_item_change_requests_updated BEFORE UPDATE ON public.item_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SEED CHECKPOINT ============
INSERT INTO public.checkpoint_definitions
  (code, label, tipo, macro_gruppo, categorie_applicabili, ruolo_responsabile, requires_role_count, richiede_documento, skip_level, sort_order)
VALUES
  ('item_created','Item Creato','automatic','planning',NULL,NULL,0,false,1,10),
  ('scope_confirmed','Scope Confermato','formal','planning',NULL,'project_manager',1,false,2,20),
  ('internal_proposal','Proposta Interna','automatic','design_validation',NULL,NULL,0,false,1,30),
  ('internal_approval','Approvazione Interna','formal','design_validation',NULL,'head_of_design',2,false,2,40),
  ('external_approval','Approvazione Esterna','formal','design_validation',NULL,'client',1,false,2,50),
  ('local_authority_approval','Approvazione autorità locale','formal','design_validation',
     ARRAY['hvac','electrical','plumbing','fire-protection','low-voltage','sanitary']::public.boq_category[],
     'mep_engineer',1,true,2,60)
ON CONFLICT (code) DO NOTHING;

-- ============ HARD GATE su Approvazione Esterna ============
CREATE OR REPLACE FUNCTION public.external_approval_blockers(_item_id uuid)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  blockers text[] := '{}';
  it public.project_items%ROWTYPE;
BEGIN
  SELECT * INTO it FROM public.project_items WHERE id = _item_id;
  IF NOT FOUND THEN RETURN blockers; END IF;

  IF EXISTS (SELECT 1 FROM public.item_rfis r WHERE r.project_item_id = _item_id AND r.status = 'open') THEN
    blockers := blockers || 'rfi_open';
  END IF;

  IF COALESCE(it.is_custom,false)
     AND it.category IN ('loose-furniture','joinery','ffe','hvac','electrical','plumbing','fire-protection','low-voltage','sanitary')
     AND NOT EXISTS (
       SELECT 1 FROM public.item_submittals s
       WHERE s.project_item_id = _item_id AND s.status = 'approved') THEN
    blockers := blockers || 'submittal_not_approved';
  END IF;

  RETURN blockers;
END; $$;
REVOKE EXECUTE ON FUNCTION public.external_approval_blockers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.external_approval_blockers(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_external_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE code text; blockers text[];
BEGIN
  SELECT d.code INTO code FROM public.checkpoint_definitions d WHERE d.id = NEW.definition_id;
  IF code = 'external_approval' AND NEW.status IN ('completed','skipped')
     AND (TG_OP = 'INSERT' OR OLD.status = 'pending') THEN
    blockers := public.external_approval_blockers(NEW.project_item_id);
    IF array_length(blockers,1) > 0 THEN
      RAISE EXCEPTION 'Approvazione esterna bloccata: %', array_to_string(blockers,', ');
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.guard_external_approval() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_guard_external_approval BEFORE INSERT OR UPDATE ON public.checkpoint_instances
  FOR EACH ROW EXECUTE FUNCTION public.guard_external_approval();

-- ============ EVENTI AUTOMATICI ============
CREATE OR REPLACE FUNCTION public.record_item_created_checkpoint()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.checkpoint_instances (project_item_id, definition_id, status, completed_by, completed_at)
  SELECT NEW.id, d.id, 'completed', NEW.created_by, now()
  FROM public.checkpoint_definitions d WHERE d.code = 'item_created'
  ON CONFLICT (project_item_id, definition_id) DO NOTHING;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.record_item_created_checkpoint() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_record_item_created AFTER INSERT ON public.project_items
  FOR EACH ROW EXECUTE FUNCTION public.record_item_created_checkpoint();

CREATE OR REPLACE FUNCTION public.record_design_checkpoints()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.lifecycle_status = 'in_design' AND OLD.lifecycle_status IS DISTINCT FROM 'in_design' THEN
    INSERT INTO public.checkpoint_instances (project_item_id, definition_id, status, completed_at)
    SELECT NEW.id, d.id, 'completed', now()
    FROM public.checkpoint_definitions d WHERE d.code = 'internal_proposal'
    ON CONFLICT (project_item_id, definition_id) DO NOTHING;
  END IF;

  -- varianti approvate diventano "incorporata" quando l'item riprende il flusso
  IF NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status
     AND NEW.lifecycle_status NOT IN ('on_hold','cancelled') THEN
    UPDATE public.item_change_requests
       SET status = 'incorporated', incorporated_at = now()
     WHERE project_item_id = NEW.id AND status = 'approved';
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.record_design_checkpoints() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_record_design_checkpoints AFTER UPDATE ON public.project_items
  FOR EACH ROW EXECUTE FUNCTION public.record_design_checkpoints();