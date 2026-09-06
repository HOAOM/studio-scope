REVOKE ALL ON FUNCTION public.enforce_requires_org_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_org_role_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_org_role_limit() FROM PUBLIC, anon, authenticated;