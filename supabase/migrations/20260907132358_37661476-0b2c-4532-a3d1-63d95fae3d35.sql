
INSERT INTO public.checkpoint_definitions (code,label,tipo,macro_gruppo,categorie_applicabili,ruolo_responsabile,requires_role_count,richiede_documento,skip_level,sort_order,is_conditional)
VALUES
 ('production_package_received','Pacchetto Produzione Ricevuto','automatic','production',NULL,NULL,0,false,1,210,false),
 ('producibility_confirmed_furn','Producibilità Confermata (FURN/WORK)','formal','production','{joinery,loose-furniture,finishes,ffe,accessories,appliances,lighting}'::boq_category[],'architectural_dept',1,false,2,220,false),
 ('producibility_confirmed_mep','Producibilità Confermata (MEP)','formal','production','{hvac,electrical,plumbing,fire-protection,low-voltage,sanitary}'::boq_category[],'mep_engineer',1,false,2,230,false),
 ('production_started','Produzione Avviata','automatic','production',NULL,NULL,0,false,1,240,false),
 ('production_final_approval','Approvazione Finale Produzione','formal','production',NULL,'project_manager',1,false,2,250,false),
 ('shipment','Spedizione','automatic','production',NULL,NULL,0,false,1,260,false),
 ('goods_arrival','Arrivo Merce','automatic','delivery',NULL,NULL,0,false,1,310,false),
 ('delivery_inspection_acceptance','Ispezione e Accettazione Consegna','formal','delivery',NULL,'site_engineer',1,true,2,320,false)
ON CONFLICT (code) DO UPDATE SET
  label=EXCLUDED.label, tipo=EXCLUDED.tipo, macro_gruppo=EXCLUDED.macro_gruppo,
  categorie_applicabili=EXCLUDED.categorie_applicabili, ruolo_responsabile=EXCLUDED.ruolo_responsabile,
  requires_role_count=EXCLUDED.requires_role_count, richiede_documento=EXCLUDED.richiede_documento,
  skip_level=EXCLUDED.skip_level, sort_order=EXCLUDED.sort_order, is_conditional=EXCLUDED.is_conditional;

CREATE OR REPLACE FUNCTION public.guard_production_started()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_has_submittal boolean;
  v_approved boolean;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT code INTO v_code FROM public.checkpoint_definitions WHERE id = NEW.definition_id;
  IF v_code IS DISTINCT FROM 'production_started' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.item_submittals s WHERE s.project_item_id = NEW.project_item_id),
         EXISTS (SELECT 1 FROM public.item_submittals s WHERE s.project_item_id = NEW.project_item_id AND s.status = 'approved')
    INTO v_has_submittal, v_approved;

  IF v_has_submittal AND NOT v_approved THEN
    RAISE EXCEPTION 'Production cannot start: submittal not approved for this item';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_production_started() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_production_started ON public.checkpoint_instances;
CREATE TRIGGER trg_guard_production_started
BEFORE INSERT OR UPDATE ON public.checkpoint_instances
FOR EACH ROW EXECUTE FUNCTION public.guard_production_started();
