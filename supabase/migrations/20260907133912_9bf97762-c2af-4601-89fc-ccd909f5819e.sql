ALTER TABLE public.checkpoint_instances
  ADD COLUMN IF NOT EXISTS needs_verification boolean NOT NULL DEFAULT false;

INSERT INTO public.checkpoint_definitions
  (code, label, tipo, macro_gruppo, categorie_applicabili, ruolo_responsabile, requires_role_count, richiede_documento, skip_level, sort_order, is_conditional)
VALUES
  ('technical_completion_check','Verifica Completamento Tecnico','formal','closing',NULL,'project_manager',1,false,2,410,false),
  ('final_documentation_delivered','Documentazione Finale Consegnata','formal','closing',NULL,'project_manager',1,true,2,420,false),
  ('client_handover_signoff','Consegna e Firma Cliente','formal','closing',NULL,'client',1,false,2,440,false),
  ('final_balance_authorized','Saldo Finale Autorizzato','formal','closing',NULL,'head_of_payments',1,false,2,450,false),
  ('warranty_activation','Attivazione Garanzia','automatic','closing',NULL,NULL,0,false,1,460,false),
  ('archiving','Archiviazione','automatic','closing',NULL,NULL,0,false,1,470,false)
ON CONFLICT (code) DO NOTHING;

-- Hard gate: nessuna NCR aperta per la verifica di completamento tecnico
CREATE OR REPLACE FUNCTION public.guard_technical_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE c text; blockers text[];
BEGIN
  SELECT d.code INTO c FROM public.checkpoint_definitions d WHERE d.id = NEW.definition_id;
  IF c = 'technical_completion_check' AND NEW.status IN ('completed','skipped')
     AND (TG_OP = 'INSERT' OR OLD.status = 'pending') THEN
    blockers := public.defect_closure_blockers(NEW.project_item_id);
    IF array_length(blockers,1) > 0 THEN
      RAISE EXCEPTION 'Verifica completamento tecnico bloccata: %', array_to_string(blockers,', ');
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_technical_completion ON public.checkpoint_instances;
CREATE TRIGGER trg_guard_technical_completion
  BEFORE INSERT OR UPDATE ON public.checkpoint_instances
  FOR EACH ROW EXECUTE FUNCTION public.guard_technical_completion();

-- Documentazione finale senza allegato -> da verificare
CREATE OR REPLACE FUNCTION public.flag_final_doc_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE c text;
BEGIN
  SELECT d.code INTO c FROM public.checkpoint_definitions d WHERE d.id = NEW.definition_id;
  IF c = 'final_documentation_delivered' AND NEW.status = 'completed' THEN
    NEW.needs_verification := (NEW.document_url IS NULL OR NEW.document_url = '');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_flag_final_doc_verification ON public.checkpoint_instances;
CREATE TRIGGER trg_flag_final_doc_verification
  BEFORE INSERT OR UPDATE ON public.checkpoint_instances
  FOR EACH ROW EXECUTE FUNCTION public.flag_final_doc_verification();

-- Attivazione garanzia automatica alla firma del cliente
CREATE OR REPLACE FUNCTION public.record_warranty_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE c text; wdef uuid;
BEGIN
  SELECT d.code INTO c FROM public.checkpoint_definitions d WHERE d.id = NEW.definition_id;
  IF c = 'client_handover_signoff' AND NEW.status = 'completed' THEN
    SELECT id INTO wdef FROM public.checkpoint_definitions WHERE code = 'warranty_activation';
    IF wdef IS NOT NULL THEN
      INSERT INTO public.checkpoint_instances (project_item_id, definition_id, status, completed_at)
      VALUES (NEW.project_item_id, wdef, 'completed', COALESCE(NEW.completed_at, now()))
      ON CONFLICT (project_item_id, definition_id) DO UPDATE
        SET status = 'completed',
            completed_at = COALESCE(EXCLUDED.completed_at, public.checkpoint_instances.completed_at, now());
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_record_warranty_activation ON public.checkpoint_instances;
CREATE TRIGGER trg_record_warranty_activation
  AFTER INSERT OR UPDATE ON public.checkpoint_instances
  FOR EACH ROW EXECUTE FUNCTION public.record_warranty_activation();

REVOKE ALL ON FUNCTION public.guard_technical_completion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flag_final_doc_verification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_warranty_activation() FROM PUBLIC, anon, authenticated;