
DO $$ BEGIN
  CREATE TYPE public.engine_category AS ENUM ('FURN','MEP','WORK','DOC','DESIGN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.master_item_types
  ADD COLUMN IF NOT EXISTS motore_categoria public.engine_category;

UPDATE public.master_item_types SET motore_categoria =
  CASE
    WHEN code IN ('LF','CF','CT','FX','DR','LT') THEN 'FURN'
    WHEN code IN ('FL','CL') THEN 'WORK'
    ELSE 'MEP'
  END::public.engine_category
WHERE motore_categoria IS NULL;

ALTER TABLE public.master_item_types
  ALTER COLUMN motore_categoria SET DEFAULT 'FURN'::public.engine_category,
  ALTER COLUMN motore_categoria SET NOT NULL;

ALTER TABLE public.checkpoint_definitions
  ADD COLUMN IF NOT EXISTS motore_categorie public.engine_category[];

UPDATE public.checkpoint_definitions SET motore_categorie =
  CASE
    WHEN categorie_applicabili IS NULL THEN ARRAY['FURN','MEP','WORK','DOC','DESIGN']::public.engine_category[]
    WHEN 'finishes' = ANY(categorie_applicabili) AND 'hvac' = ANY(categorie_applicabili) THEN ARRAY['MEP','WORK']::public.engine_category[]
    WHEN 'hvac' = ANY(categorie_applicabili) THEN ARRAY['MEP']::public.engine_category[]
    ELSE ARRAY['FURN']::public.engine_category[]
  END;

ALTER TABLE public.checkpoint_definitions
  ALTER COLUMN motore_categorie SET DEFAULT ARRAY['FURN','MEP','WORK','DOC','DESIGN']::public.engine_category[],
  ALTER COLUMN motore_categorie SET NOT NULL;

CREATE OR REPLACE FUNCTION public.item_engine_category(p_item_id uuid)
RETURNS public.engine_category
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mit.motore_categoria
  FROM public.project_items pi
  LEFT JOIN public.master_item_types mit ON mit.id = pi.item_type_id
  WHERE pi.id = p_item_id
$$;

CREATE OR REPLACE FUNCTION public.checkpoint_applies_to_item(p_definition_id uuid, p_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.item_engine_category(p_item_id) = ANY(cd.motore_categorie),
    true
  )
  FROM public.checkpoint_definitions cd
  WHERE cd.id = p_definition_id
$$;

REVOKE ALL ON FUNCTION public.item_engine_category(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.checkpoint_applies_to_item(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.item_engine_category(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.checkpoint_applies_to_item(uuid, uuid) TO authenticated, service_role;
