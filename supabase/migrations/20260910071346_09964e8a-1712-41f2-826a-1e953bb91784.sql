
REVOKE EXECUTE ON FUNCTION public.item_org(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_act_item_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.checkpoint_write_allowed(uuid, uuid, public.checkpoint_instance_status, uuid, uuid) FROM PUBLIC, anon;
