
-- ============ 1. ENTITLEMENTS (provider-agnostic) ============
DO $$ BEGIN
  CREATE TYPE public.entitlement_status AS ENUM ('trialing','active','past_due','suspended','canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.organization_entitlements (
  organization_id    uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  tier               public.subscription_tier NOT NULL DEFAULT 'basic',
  status             public.entitlement_status NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  trial_ends_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.organization_entitlements TO authenticated;
GRANT ALL    ON public.organization_entitlements TO service_role;
ALTER TABLE public.organization_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entitlements_member_read ON public.organization_entitlements;
CREATE POLICY entitlements_member_read ON public.organization_entitlements
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS entitlements_platform_write ON public.organization_entitlements;
CREATE POLICY entitlements_platform_write ON public.organization_entitlements
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
GRANT INSERT, UPDATE, DELETE ON public.organization_entitlements TO authenticated;

DROP TRIGGER IF EXISTS trg_entitlements_updated_at ON public.organization_entitlements;
CREATE TRIGGER trg_entitlements_updated_at BEFORE UPDATE ON public.organization_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- backfill dagli abbonamenti esistenti (nessuna perdita di dati storici)
INSERT INTO public.organization_entitlements (organization_id, tier, status, current_period_end)
SELECT o.id,
       COALESCE(s.tier, 'basic'::public.subscription_tier),
       CASE COALESCE(s.status::text, 'active')
         WHEN 'active' THEN 'active' WHEN 'grace' THEN 'past_due'
         WHEN 'suspended' THEN 'suspended' ELSE 'canceled' END::public.entitlement_status,
       s.current_period_end
FROM public.organizations o
LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
ON CONFLICT (organization_id) DO NOTHING;

-- crea automaticamente i diritti per ogni nuova organizzazione
CREATE OR REPLACE FUNCTION public.create_entitlements_for_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.organization_entitlements (organization_id)
  VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_create_entitlements_for_org ON public.organizations;
CREATE TRIGGER trg_create_entitlements_for_org AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.create_entitlements_for_org();

-- l'enforcement esistente legge ora SOLO gli entitlements (firma invariata)
CREATE OR REPLACE FUNCTION public.get_org_effective_tier(_org_id uuid)
RETURNS public.subscription_tier
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT e.tier FROM public.organization_entitlements e
      WHERE e.organization_id = _org_id
        AND e.status IN ('trialing','active','past_due')
      LIMIT 1),
    'basic'::public.subscription_tier)
$$;

-- ============ 2. LIVELLO FORNITORE (isolato) ============
CREATE TABLE IF NOT EXISTS public.billing_provider_accounts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider                text NOT NULL DEFAULT 'lemonsqueezy',
  provider_customer_id    text,
  provider_subscription_id text,
  provider_price_id       text,
  raw_metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_provider_sub_idx
  ON public.billing_provider_accounts (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

GRANT ALL ON public.billing_provider_accounts TO service_role;
ALTER TABLE public.billing_provider_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_accounts_platform ON public.billing_provider_accounts;
CREATE POLICY billing_accounts_platform ON public.billing_provider_accounts
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_provider_accounts TO authenticated;

DROP TRIGGER IF EXISTS trg_billing_accounts_updated_at ON public.billing_provider_accounts;
CREATE TRIGGER trg_billing_accounts_updated_at BEFORE UPDATE ON public.billing_provider_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.billing_price_map (
  provider          text NOT NULL DEFAULT 'lemonsqueezy',
  provider_price_id text NOT NULL,
  tier              public.subscription_tier NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_price_id)
);
GRANT SELECT ON public.billing_price_map TO authenticated;
GRANT ALL    ON public.billing_price_map TO service_role;
ALTER TABLE public.billing_price_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_map_read ON public.billing_price_map;
CREATE POLICY price_map_read ON public.billing_price_map FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS price_map_platform ON public.billing_price_map;
CREATE POLICY price_map_platform ON public.billing_price_map FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
GRANT INSERT, UPDATE, DELETE ON public.billing_price_map TO authenticated;

CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text NOT NULL DEFAULT 'lemonsqueezy',
  provider_event_id text NOT NULL,
  event_name        text,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at      timestamptz,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);
GRANT ALL ON public.billing_webhook_events TO service_role;
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS webhook_events_platform ON public.billing_webhook_events;
CREATE POLICY webhook_events_platform ON public.billing_webhook_events
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
GRANT SELECT ON public.billing_webhook_events TO authenticated;

-- ============ 3. CONFIGURAZIONE DI SISTEMA (trial_enabled) ============
CREATE TABLE IF NOT EXISTS public.system_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL    ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_settings_read ON public.system_settings;
CREATE POLICY system_settings_read ON public.system_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS system_settings_platform ON public.system_settings;
CREATE POLICY system_settings_platform ON public.system_settings FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
GRANT INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;

INSERT INTO public.system_settings (key, value) VALUES
  ('trial_enabled', 'false'::jsonb),
  ('trial_days', '14'::jsonb),
  ('trial_tier', '"advanced"'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.trial_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT (value)::text::boolean FROM public.system_settings WHERE key='trial_enabled'), false)
$$;
GRANT EXECUTE ON FUNCTION public.trial_enabled() TO authenticated, anon;

-- avvio prova gratuita (attivo solo se trial_enabled = true)
CREATE OR REPLACE FUNCTION public.start_trial(p_org uuid)
RETURNS public.organization_entitlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_days int; v_tier public.subscription_tier; v_row public.organization_entitlements;
BEGIN
  IF NOT public.trial_enabled() THEN
    RAISE EXCEPTION 'Prova gratuita non attiva' USING ERRCODE='check_violation';
  END IF;
  SELECT COALESCE((value)::text::int, 14) INTO v_days FROM public.system_settings WHERE key='trial_days';
  SELECT COALESCE(trim(both '"' from value::text), 'advanced')::public.subscription_tier
    INTO v_tier FROM public.system_settings WHERE key='trial_tier';

  INSERT INTO public.organization_entitlements (organization_id, tier, status, trial_ends_at)
  VALUES (p_org, v_tier, 'trialing', now() + make_interval(days => v_days))
  ON CONFLICT (organization_id) DO UPDATE
    SET tier = EXCLUDED.tier, status = 'trialing', trial_ends_at = EXCLUDED.trial_ends_at
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.start_trial(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_trial(uuid) TO service_role;

-- scadenza prove: trialing -> suspended (nessun pagamento) 
CREATE OR REPLACE FUNCTION public.expire_trials()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  UPDATE public.organization_entitlements
     SET status = 'suspended', tier = 'basic'
   WHERE status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at <= now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.expire_trials() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_trials() TO service_role;

-- ============ 4. ERRORE STRUTTURATO PER L'UPSELL ============
CREATE OR REPLACE FUNCTION public.next_tier(t public.subscription_tier)
RETURNS public.subscription_tier LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE t WHEN 'basic' THEN 'advanced' WHEN 'advanced' THEN 'pro' ELSE 'enterprise' END::public.subscription_tier
$$;

CREATE OR REPLACE FUNCTION public.tier_limit_error(
  p_tier public.subscription_tier, p_resource text, p_current int, p_limit int)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'code','TIER_LIMIT_REACHED','resource',p_resource,'current',p_current,
    'limit',p_limit,'current_tier',p_tier::text,'suggested_tier',public.next_tier(p_tier)::text)::text
$$;

CREATE OR REPLACE FUNCTION public.enforce_project_tier_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_tier public.subscription_tier; v_limit integer; v_count integer;
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  IF public.is_platform_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.owner_id IS NOT NULL AND public.is_platform_admin(NEW.owner_id) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.archived_at IS NOT NULL THEN RETURN NEW; END IF;

  v_tier := public.get_org_effective_tier(NEW.organization_id);
  SELECT max_active_projects INTO v_limit FROM public.get_tier_limits(NEW.organization_id);
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  v_count := public.get_org_active_project_count(NEW.organization_id);
  IF v_count >= v_limit THEN
    RAISE EXCEPTION
      'Limite progetti attivi raggiunto per il piano % (% / % progetti). Archivia un progetto o esegui un upgrade di piano.',
      v_tier, v_count, v_limit
      USING ERRCODE = 'check_violation',
            DETAIL = public.tier_limit_error(v_tier, 'active_projects', v_count, v_limit);
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_org_seat_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_limit integer; v_used integer; v_tier public.subscription_tier;
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  IF public.is_platform_admin(auth.uid()) THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'organization_invites' THEN
    IF NEW.invited_by IS NOT NULL AND public.is_platform_admin(NEW.invited_by) THEN RETURN NEW; END IF;
    IF NEW.status IS DISTINCT FROM 'pending' THEN RETURN NEW; END IF;
  END IF;

  v_tier := public.get_org_effective_tier(NEW.organization_id);
  SELECT max_seats INTO v_limit FROM public.get_tier_limits(NEW.organization_id);
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  v_used := public.org_seat_count(NEW.organization_id, TG_TABLE_NAME = 'organization_invites');
  IF v_used >= v_limit THEN
    RAISE EXCEPTION
      'Limite posti raggiunto per il piano % (% / % posti occupati). Serve un upgrade di piano per aggiungere altre persone.',
      v_tier, v_used, v_limit
      USING ERRCODE = 'check_violation',
            DETAIL = public.tier_limit_error(v_tier, 'seats', v_used, v_limit);
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_boq_item_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_org uuid; v_tier public.subscription_tier; v_limit integer; v_count integer;
BEGIN
  IF public.is_platform_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.created_by IS NOT NULL AND public.is_platform_admin(NEW.created_by) THEN RETURN NEW; END IF;

  SELECT organization_id INTO v_org FROM public.projects WHERE id = NEW.project_id;
  IF v_org IS NULL THEN RETURN NEW; END IF;

  v_tier := public.get_org_effective_tier(v_org);
  SELECT max_boq_items_per_project INTO v_limit FROM public.get_tier_limits(v_org);
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  v_count := public.project_boq_item_count(NEW.project_id);
  IF v_count >= v_limit THEN
    RAISE EXCEPTION
      'Limite voci BOQ raggiunto per il piano % (% / % voci su questo progetto). Serve un upgrade di piano per aggiungere altre voci.',
      v_tier, v_count, v_limit
      USING ERRCODE = 'check_violation',
            DETAIL = public.tier_limit_error(v_tier, 'boq_items', v_count, v_limit);
  END IF;
  RETURN NEW;
END; $function$;

-- ============ 5. DOWNGRADE CON SELEZIONE ESPLICITA ============
CREATE OR REPLACE FUNCTION public.downgrade_preview(p_org uuid, p_target public.subscription_tier)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit int; v_used int; v_seats int; v_seat_limit int;
  v_storage bigint; v_storage_limit bigint; v_projects jsonb;
BEGIN
  IF NOT (public.is_org_admin(p_org) OR public.is_org_owner(p_org) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Non autorizzato' USING ERRCODE='insufficient_privilege';
  END IF;
  SELECT max_active_projects, max_seats, max_storage_bytes
    INTO v_limit, v_seat_limit, v_storage_limit
    FROM public.tier_limits WHERE tier = p_target;

  v_used    := public.get_org_active_project_count(p_org);
  v_seats   := public.org_seat_count(p_org, false);
  v_storage := public.org_storage_bytes(p_org);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'code', p.code, 'name', p.name, 'created_at', p.created_at
         ) ORDER BY p.created_at DESC), '[]'::jsonb)
    INTO v_projects
    FROM public.projects p
   WHERE p.organization_id = p_org AND p.archived_at IS NULL;

  RETURN jsonb_build_object(
    'target_tier', p_target::text,
    'blocking', (v_limit IS NOT NULL AND v_used > v_limit)
             OR (v_seat_limit IS NOT NULL AND v_seats > v_seat_limit)
             OR (v_storage_limit IS NOT NULL AND v_storage > v_storage_limit),
    'active_projects', jsonb_build_object(
      'current', v_used, 'limit', v_limit,
      'must_release', GREATEST(COALESCE(v_used - v_limit, 0), 0),
      'candidates', v_projects),
    'seats', jsonb_build_object('current', v_seats, 'limit', v_seat_limit,
      'must_release', GREATEST(COALESCE(v_seats - v_seat_limit, 0), 0)),
    'storage', jsonb_build_object('current', v_storage, 'limit', v_storage_limit,
      'must_release', GREATEST(COALESCE(v_storage - v_storage_limit, 0), 0))
  );
END $$;
GRANT EXECUTE ON FUNCTION public.downgrade_preview(uuid, public.subscription_tier) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_downgrade(
  p_org uuid, p_target public.subscription_tier, p_archive_project_ids uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_preview jsonb;
BEGIN
  IF NOT (public.is_org_admin(p_org) OR public.is_org_owner(p_org) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Non autorizzato' USING ERRCODE='insufficient_privilege';
  END IF;

  UPDATE public.projects
     SET archived_at = now()
   WHERE organization_id = p_org AND archived_at IS NULL
     AND id = ANY(COALESCE(p_archive_project_ids, '{}'));

  v_preview := public.downgrade_preview(p_org, p_target);
  IF (v_preview->>'blocking')::boolean THEN
    RAISE EXCEPTION 'Risorse ancora oltre il limite del piano di destinazione'
      USING ERRCODE='check_violation', DETAIL = v_preview::text;
  END IF;

  UPDATE public.organization_entitlements
     SET tier = p_target
   WHERE organization_id = p_org;

  RETURN jsonb_build_object('ok', true, 'tier', p_target::text, 'preview', v_preview);
END $$;
GRANT EXECUTE ON FUNCTION public.apply_downgrade(uuid, public.subscription_tier, uuid[]) TO authenticated;

-- ============ 6. DOMINIO UNIVOCO PER ORGANIZZAZIONE ============
CREATE OR REPLACE FUNCTION public.normalize_org_domain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.domain := lower(regexp_replace(trim(NEW.domain), '^(https?://)?(www\.)?', ''));
  NEW.domain := split_part(NEW.domain, '/', 1);
  IF EXISTS (SELECT 1 FROM public.organization_domains d
              WHERE lower(d.domain) = NEW.domain AND d.id IS DISTINCT FROM NEW.id) THEN
    RAISE EXCEPTION 'Il dominio % è già associato a un''altra organizzazione', NEW.domain
      USING ERRCODE='unique_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_normalize_org_domain ON public.organization_domains;
CREATE TRIGGER trg_normalize_org_domain BEFORE INSERT OR UPDATE ON public.organization_domains
  FOR EACH ROW EXECUTE FUNCTION public.normalize_org_domain();

CREATE OR REPLACE FUNCTION public.domain_is_available(p_domain text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.organization_domains d
    WHERE lower(d.domain) = lower(regexp_replace(trim(p_domain), '^(https?://)?(www\.)?', ''))
  )
$$;
GRANT EXECUTE ON FUNCTION public.domain_is_available(text) TO authenticated, anon, service_role;
