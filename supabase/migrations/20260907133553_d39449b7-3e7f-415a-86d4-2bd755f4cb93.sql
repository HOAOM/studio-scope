DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='ncr_status') THEN
    CREATE TYPE public.ncr_status AS ENUM ('open','action_proposed','rework','closed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.item_ncrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_item_id uuid NOT NULL REFERENCES public.project_items(id) ON DELETE CASCADE,
  description text NOT NULL,
  opened_by uuid,
  status public.ncr_status NOT NULL DEFAULT 'open',
  corrective_action text,
  closed_by uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  action_proposed_at timestamptz,
  rework_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_ncrs TO authenticated;
GRANT ALL ON public.item_ncrs TO service_role;

ALTER TABLE public.item_ncrs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "item scope manages ncrs" ON public.item_ncrs;
CREATE POLICY "item scope manages ncrs" ON public.item_ncrs
  FOR ALL TO authenticated
  USING (public.can_access_item(project_item_id))
  WITH CHECK (public.can_access_item(project_item_id));

CREATE INDEX IF NOT EXISTS idx_item_ncrs_item ON public.item_ncrs(project_item_id);

DROP TRIGGER IF EXISTS trg_item_ncrs_updated ON public.item_ncrs;
CREATE TRIGGER trg_item_ncrs_updated BEFORE UPDATE ON public.item_ncrs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Hard gate: chiusura lista difetti bloccata da NCR non chiuse
CREATE OR REPLACE FUNCTION public.defect_closure_blockers(_item_id uuid)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE blockers text[] := '{}';
BEGIN
  IF EXISTS (SELECT 1 FROM public.item_ncrs n
             WHERE n.project_item_id = _item_id AND n.status <> 'closed') THEN
    blockers := blockers || 'ncr_open';
  END IF;
  RETURN blockers;
END; $$;

REVOKE ALL ON FUNCTION public.defect_closure_blockers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.defect_closure_blockers(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_defect_list_closure()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE c text; blockers text[];
BEGIN
  SELECT d.code INTO c FROM public.checkpoint_definitions d WHERE d.id = NEW.definition_id;
  IF c = 'defect_list_closure' AND NEW.status IN ('completed','skipped')
     AND (TG_OP = 'INSERT' OR OLD.status = 'pending') THEN
    blockers := public.defect_closure_blockers(NEW.project_item_id);
    IF array_length(blockers,1) > 0 THEN
      RAISE EXCEPTION 'Chiusura lista difetti bloccata: %', array_to_string(blockers,', ');
    END IF;
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.guard_defect_list_closure() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_defect_list_closure ON public.checkpoint_instances;
CREATE TRIGGER trg_guard_defect_list_closure
  BEFORE INSERT OR UPDATE ON public.checkpoint_instances
  FOR EACH ROW EXECUTE FUNCTION public.guard_defect_list_closure();

-- Seed Installation
INSERT INTO public.checkpoint_definitions
  (code, label, tipo, macro_gruppo, categorie_applicabili, ruolo_responsabile, requires_role_count, richiede_documento, skip_level, sort_order)
VALUES
  ('site_prerequisites','Prerequisiti Cantiere Verificati','formal','installation', NULL,'site_engineer',1,false,2,310),
  ('installation_completed','Installazione Completata','automatic','installation', NULL, NULL,0,false,1,320),
  ('partial_technical_test','Test Tecnico Parziale','formal','installation', ARRAY['hvac','electrical','plumbing','fire-protection','low-voltage','sanitary','finishes']::boq_category[],'mep_engineer',1,false,2,330),
  ('cover_up_release','Rilascio Copertura (Cover-Up Release)','formal','installation', ARRAY['finishes','hvac','electrical','plumbing','fire-protection','low-voltage','sanitary']::boq_category[],'site_engineer',1,true,2,340),
  ('final_inspection','Ispezione Finale','formal','installation', NULL,'site_engineer',1,false,2,350),
  ('client_walkthrough','Walkthrough Cliente','formal','installation', NULL,'client',1,false,2,360),
  ('defect_list_closure','Chiusura Lista Difetti','formal','installation', NULL,'site_engineer',1,false,2,370)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label, tipo = EXCLUDED.tipo, macro_gruppo = EXCLUDED.macro_gruppo,
  categorie_applicabili = EXCLUDED.categorie_applicabili, ruolo_responsabile = EXCLUDED.ruolo_responsabile,
  requires_role_count = EXCLUDED.requires_role_count, richiede_documento = EXCLUDED.richiede_documento,
  skip_level = EXCLUDED.skip_level, sort_order = EXCLUDED.sort_order;