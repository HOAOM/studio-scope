CREATE OR REPLACE FUNCTION public.seed_master_data_for_org(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_tpl uuid;
BEGIN
  -- squadre base: sempre create, indipendenti dal template
  INSERT INTO public.teams (organization_id, name, code, discipline, color, is_active)
  SELECT p_org, t.name, t.code, t.discipline, t.color, true
    FROM (VALUES
      ('Design','DSG','design','#6366f1'),
      ('Architectural','ARC','architectural','#0ea5e9'),
      ('MEP','MEP','mep','#f59e0b'),
      ('Site','SIT','site','#22c55e'),
      ('Procurement','PRC','procurement','#a855f7'),
      ('Production','PRD','production','#ef4444'),
      ('Installation','INS','installation','#14b8a6'),
      ('Administration','ADM','administration','#64748b')
    ) AS t(name, code, discipline, color)
  ON CONFLICT (organization_id, name) DO NOTHING;

  SELECT id INTO v_tpl FROM public.organizations
   WHERE id <> p_org ORDER BY created_at ASC LIMIT 1;
  IF v_tpl IS NULL THEN RETURN; END IF;

  INSERT INTO public.master_floors (organization_id, name, code, sort_order)
  SELECT p_org, name, code, sort_order FROM public.master_floors WHERE organization_id = v_tpl
  ON CONFLICT DO NOTHING;

  INSERT INTO public.master_rooms (organization_id, name, code, sort_order)
  SELECT p_org, name, code, sort_order FROM public.master_rooms WHERE organization_id = v_tpl
  ON CONFLICT DO NOTHING;

  INSERT INTO public.cost_categories (organization_id, name, code, sort_order, is_active)
  SELECT p_org, name, code, sort_order, is_active FROM public.cost_categories WHERE organization_id = v_tpl
  ON CONFLICT DO NOTHING;

  INSERT INTO public.master_item_types (organization_id, name, code, sort_order, allowed_categories)
  SELECT p_org, name, code, sort_order, allowed_categories FROM public.master_item_types WHERE organization_id = v_tpl
  ON CONFLICT DO NOTHING;

  INSERT INTO public.master_subcategories (organization_id, item_type_id, name, code, sort_order)
  SELECT p_org, newt.id, s.name, s.code, s.sort_order
    FROM public.master_subcategories s
    JOIN public.master_item_types oldt ON oldt.id = s.item_type_id AND oldt.organization_id = v_tpl
    JOIN public.master_item_types newt ON newt.organization_id = p_org AND newt.code = oldt.code
   WHERE s.organization_id = v_tpl
  ON CONFLICT DO NOTHING;

  INSERT INTO public.master_subcategories (organization_id, item_type_id, name, code, sort_order)
  SELECT p_org, NULL, s.name, s.code, s.sort_order
    FROM public.master_subcategories s
   WHERE s.organization_id = v_tpl AND s.item_type_id IS NULL
  ON CONFLICT DO NOTHING;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.seed_master_data_for_org(uuid) FROM PUBLIC, anon, authenticated;