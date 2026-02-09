-- Enum types for War Room
CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected', 'revision');
CREATE TYPE public.boq_coverage_status AS ENUM ('present', 'missing', 'to-confirm');
CREATE TYPE public.boq_category AS ENUM ('joinery', 'loose-furniture', 'lighting', 'finishes', 'ffe', 'accessories', 'appliances');

-- Projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  client TEXT NOT NULL,
  location TEXT,
  start_date DATE NOT NULL,
  target_completion_date DATE NOT NULL,
  boq_master_ref TEXT,
  boq_version TEXT,
  last_update_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  project_manager TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Project items table
CREATE TABLE public.project_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category public.boq_category NOT NULL,
  area TEXT NOT NULL,
  description TEXT NOT NULL,
  image_3d_ref TEXT,
  boq_included BOOLEAN NOT NULL DEFAULT false,
  approval_status public.approval_status NOT NULL DEFAULT 'pending',
  purchased BOOLEAN NOT NULL DEFAULT false,
  purchase_order_ref TEXT,
  production_due_date DATE,
  delivery_date DATE,
  received BOOLEAN NOT NULL DEFAULT false,
  received_date DATE,
  installed BOOLEAN NOT NULL DEFAULT false,
  installed_date DATE,
  supplier TEXT,
  unit_cost NUMERIC(12, 2),
  quantity INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- BOQ coverage table
CREATE TABLE public.boq_coverage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category public.boq_category NOT NULL,
  status public.boq_coverage_status NOT NULL DEFAULT 'missing',
  item_count INTEGER NOT NULL DEFAULT 0,
  approved_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, category)
);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boq_coverage ENABLE ROW LEVEL SECURITY;

-- Helper function to check project ownership
CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = p_project_id
      AND owner_id = auth.uid()
  )
$$;

-- RLS Policies for projects
CREATE POLICY "Users can view their own projects"
ON public.projects FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Users can create their own projects"
ON public.projects FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update their own projects"
ON public.projects FOR UPDATE
TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Users can delete their own projects"
ON public.projects FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

-- RLS Policies for project_items
CREATE POLICY "Users can view items of their projects"
ON public.project_items FOR SELECT
TO authenticated
USING (public.is_project_owner(project_id));

CREATE POLICY "Users can create items in their projects"
ON public.project_items FOR INSERT
TO authenticated
WITH CHECK (public.is_project_owner(project_id));

CREATE POLICY "Users can update items in their projects"
ON public.project_items FOR UPDATE
TO authenticated
USING (public.is_project_owner(project_id));

CREATE POLICY "Users can delete items from their projects"
ON public.project_items FOR DELETE
TO authenticated
USING (public.is_project_owner(project_id));

-- RLS Policies for boq_coverage
CREATE POLICY "Users can view BOQ coverage of their projects"
ON public.boq_coverage FOR SELECT
TO authenticated
USING (public.is_project_owner(project_id));

CREATE POLICY "Users can create BOQ coverage for their projects"
ON public.boq_coverage FOR INSERT
TO authenticated
WITH CHECK (public.is_project_owner(project_id));

CREATE POLICY "Users can update BOQ coverage of their projects"
ON public.boq_coverage FOR UPDATE
TO authenticated
USING (public.is_project_owner(project_id));

CREATE POLICY "Users can delete BOQ coverage from their projects"
ON public.boq_coverage FOR DELETE
TO authenticated
USING (public.is_project_owner(project_id));

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_items_updated_at
  BEFORE UPDATE ON public.project_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_boq_coverage_updated_at
  BEFORE UPDATE ON public.boq_coverage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_projects_owner_id ON public.projects(owner_id);
CREATE INDEX idx_project_items_project_id ON public.project_items(project_id);
CREATE INDEX idx_project_items_category ON public.project_items(category);
CREATE INDEX idx_boq_coverage_project_id ON public.boq_coverage(project_id);