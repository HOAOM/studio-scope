-- Fix project_items RLS to include project members
DROP POLICY IF EXISTS "Users can view items of their projects" ON public.project_items;
DROP POLICY IF EXISTS "Users can create items in their projects" ON public.project_items;
DROP POLICY IF EXISTS "Users can update items in their projects" ON public.project_items;
DROP POLICY IF EXISTS "Users can delete items from their projects" ON public.project_items;
DROP POLICY IF EXISTS "Members can view items of assigned projects" ON public.project_items;

CREATE POLICY "Members can view items of their projects"
ON public.project_items FOR SELECT TO authenticated
USING (public.is_project_member(project_id) OR public.is_project_owner(project_id));

CREATE POLICY "Members can create items in their projects"
ON public.project_items FOR INSERT TO authenticated
WITH CHECK (public.is_project_member(project_id) OR public.is_project_owner(project_id));

CREATE POLICY "Members can update items in their projects"
ON public.project_items FOR UPDATE TO authenticated
USING (public.is_project_member(project_id) OR public.is_project_owner(project_id));

CREATE POLICY "Owners can delete items from their projects"
ON public.project_items FOR DELETE TO authenticated
USING (public.is_project_owner(project_id));

-- Fix boq_coverage RLS
DROP POLICY IF EXISTS "Users can view BOQ coverage of their projects" ON public.boq_coverage;
DROP POLICY IF EXISTS "Users can create BOQ coverage for their projects" ON public.boq_coverage;
DROP POLICY IF EXISTS "Users can update BOQ coverage of their projects" ON public.boq_coverage;
DROP POLICY IF EXISTS "Users can delete BOQ coverage from their projects" ON public.boq_coverage;
DROP POLICY IF EXISTS "Members can view BOQ coverage of assigned projects" ON public.boq_coverage;

CREATE POLICY "Members can view BOQ coverage of their projects"
ON public.boq_coverage FOR SELECT TO authenticated
USING (public.is_project_member(project_id) OR public.is_project_owner(project_id));

CREATE POLICY "Members can create BOQ coverage in their projects"
ON public.boq_coverage FOR INSERT TO authenticated
WITH CHECK (public.is_project_member(project_id) OR public.is_project_owner(project_id));

CREATE POLICY "Members can update BOQ coverage in their projects"
ON public.boq_coverage FOR UPDATE TO authenticated
USING (public.is_project_member(project_id) OR public.is_project_owner(project_id));

CREATE POLICY "Owners can delete BOQ coverage from their projects"
ON public.boq_coverage FOR DELETE TO authenticated
USING (public.is_project_owner(project_id));
