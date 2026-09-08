/**
 * billing-reconcile — job giornaliero: confronta i diritti salvati con lo stato
 * reale degli abbonamenti su Lemon Squeezy e corregge i disallineamenti dovuti
 * a webhook persi. Fa scadere anche le prove gratuite (se attive).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { mapLemonStatus, type Tier } from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const apiKey = Deno.env.get('LEMONSQUEEZY_API_KEY');
  const report: Array<Record<string, unknown>> = [];

  const { data: expired } = await supabase.rpc('expire_trials');

  if (apiKey) {
    const { data: accounts } = await supabase.from('billing_provider_accounts')
      .select('organization_id, provider_subscription_id, provider_price_id')
      .eq('provider', 'lemonsqueezy')
      .not('provider_subscription_id', 'is', null);

    for (const acc of accounts ?? []) {
      try {
        const res = await fetch(
          `https://api.lemonsqueezy.com/v1/subscriptions/${acc.provider_subscription_id}`,
          { headers: { Accept: 'application/vnd.api+json', Authorization: `Bearer ${apiKey}` } },
        );
        if (!res.ok) { report.push({ org: acc.organization_id, error: `HTTP ${res.status}` }); continue; }
        const body = await res.json();
        const attrs = body?.data?.attributes ?? {};
        const status = mapLemonStatus(attrs?.status);
        const priceId = attrs?.variant_id ? String(attrs.variant_id) : acc.provider_price_id;

        let tier: Tier | null = null;
        if (priceId) {
          const { data: map } = await supabase.from('billing_price_map')
            .select('tier').eq('provider', 'lemonsqueezy')
            .eq('provider_price_id', priceId).maybeSingle();
          tier = (map?.tier as Tier) ?? null;
        }

        const { data: current } = await supabase.from('organization_entitlements')
          .select('tier, status, current_period_end')
          .eq('organization_id', acc.organization_id).maybeSingle();

        const desired: Record<string, unknown> = {
          organization_id: acc.organization_id,
          status,
          current_period_end: attrs?.renews_at ?? attrs?.ends_at ?? null,
        };
        if (tier) desired.tier = tier;
        if (status === 'canceled' || status === 'suspended') desired.tier = 'basic';

        const drift = !current
          || current.status !== desired.status
          || (desired.tier && current.tier !== desired.tier);

        if (drift) {
          await supabase.from('organization_entitlements')
            .upsert(desired, { onConflict: 'organization_id' });
          await supabase.from('billing_provider_accounts')
            .update({ provider_price_id: priceId, raw_metadata: attrs })
            .eq('provider', 'lemonsqueezy').eq('organization_id', acc.organization_id);
          report.push({ org: acc.organization_id, corrected: desired });
        }
      } catch (e) {
        report.push({ org: acc.organization_id, error: (e as Error).message });
      }
    }
  }

  return new Response(JSON.stringify({
    ok: true, trials_expired: expired ?? 0, provider_checked: Boolean(apiKey), report,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
