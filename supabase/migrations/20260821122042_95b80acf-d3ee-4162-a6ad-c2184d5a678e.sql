CREATE OR REPLACE FUNCTION public.user_has_password(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT u.encrypted_password IS NOT NULL AND length(u.encrypted_password) > 0
     FROM auth.users u WHERE u.id = _user_id),
    false
  )
$$;

REVOKE ALL ON FUNCTION public.user_has_password(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_password(uuid) TO service_role;