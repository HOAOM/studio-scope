
CREATE OR REPLACE FUNCTION public.normalize_org_domain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.domain := split_part(
    regexp_replace(lower(trim(NEW.domain)), '^(https?://)?(www\.)?', ''), '/', 1);
  IF EXISTS (SELECT 1 FROM public.organization_domains d
              WHERE lower(d.domain) = NEW.domain AND d.id IS DISTINCT FROM NEW.id) THEN
    RAISE EXCEPTION 'Il dominio % è già associato a un''altra organizzazione', NEW.domain
      USING ERRCODE='unique_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.domain_is_available(p_domain text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.organization_domains d
    WHERE lower(d.domain) = split_part(
      regexp_replace(lower(trim(p_domain)), '^(https?://)?(www\.)?', ''), '/', 1)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.domain_is_available(text) FROM anon;
