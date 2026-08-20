CREATE INDEX IF NOT EXISTS profiles_lower_email_idx ON public.profiles (lower(email));

CREATE OR REPLACE FUNCTION public.find_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE lower(email) = lower(p_email) LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.find_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_id_by_email(text) TO service_role;