ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS export_template text DEFAULT 'classic';
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS contact_email text;
