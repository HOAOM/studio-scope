REVOKE ALL ON FUNCTION public.guard_org_position_cycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.org_reports(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_reports(uuid, boolean) TO authenticated;