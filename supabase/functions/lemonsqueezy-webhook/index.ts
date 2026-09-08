/**
 * lemonsqueezy-webhook — riceve gli eventi di abbonamento di Lemon Squeezy.
 * Passi: verifica firma -> idempotenza -> aggiorna account fornitore + diritti.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { mapLemonStatus, type Tier } from '../_shared/billing.ts';
import { verifyLemonSignature } from '../_shared/billing.ts';

const HANDLED = new Set([
  'subscription_created', 'subscription_updated', 'subscription_cancelled',
  'subscription_payment_success', 'subscription_payment_failed',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const secret = Deno.env.get('LEMONSQUEEZY_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'webhook secret not configured' }, 500);

  const raw = await req.text();
  const ok = await verifyLemonSignature(raw, req.headers.get('x-signature'), secret);
  if (!ok) return json({ error: 'invalid signature' }, 401);

  const payload = JSON.parse(raw);
  const eventName: string = payload?.meta?.event_name ?? req.headers.get('x-event-name') ?? '';
  const data = payload?.data ?? {};
  const attrs = data?.attributes ?? {};
  const custom = payload?.meta?.custom_data ?? {};
  const eventId = String(
    payload?.meta?.webhook_id ?? `${eventName}:${data?.id}:${attrs?.updated_at ?? ''}`,
  );

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // idempotenza: l'inserimento fallisce se l'evento è già stato ricevuto
  const { error: dupErr } = await supabase.from('billing_webhook_events').insert({
    provider: 'lemonsqueezy', provider_event_id: eventId,
    event_name: eventName, payload,
  });
  if (dupErr) {
    if ((dupErr as any).code === '23505') return json({ ok: true, duplicate: true });
    return json({ error: dupErr.message }, 500);
  }

  if (!HANDLED.has(eventName)) {
    await markProcessed(supabase, eventId, null);
    return json({ ok: true, ignored: eventName });
  }

  try {
    const orgId: string | null = custom.organization_id ?? null;
    const subscriptionId = String(data?.id ?? '');
    const priceId = attrs?.variant_id ? String(attrs.variant_id) : null;

    // risolve l'organizzazione: custom_data oppure abbonamento già collegato
    let organizationId = orgId;
    if (!organizationId && subscriptionId) {
      const { data: acc } = await supabase.from('billing_provider_accounts')
        .select('organization_id')
        .eq('provider', 'lemonsqueezy')
        .eq('provider_subscription_id', subscriptionId).maybeSingle();
      organizationId = acc?.organization_id ?? null;
    }
    if (!organizationId) throw new Error('organization_id non risolvibile per questo evento');

    await supabase.from('billing_provider_accounts').upsert({
      organization_id: organizationId,
      provider: 'lemonsqueezy',
      provider_customer_id: attrs?.customer_id ? String(attrs.customer_id) : null,
      provider_subscription_id: subscriptionId || null,
      provider_price_id: priceId,
      raw_metadata: attrs ?? {},
    }, { onConflict: 'provider,organization_id' });

    // tier dalla mappa prezzi (unica dipendenza dal listino del fornitore)
    let tier: Tier | null = null;
    if (priceId) {
      const { data: map } = await supabase.from('billing_price_map')
        .select('tier').eq('provider', 'lemonsqueezy')
        .eq('provider_price_id', priceId).maybeSingle();
      tier = (map?.tier as Tier) ?? null;
    }

    let status = mapLemonStatus(attrs?.status);
    if (eventName === 'subscription_payment_failed') status = 'past_due';
    if (eventName === 'subscription_cancelled') status = 'canceled';

    const entitlement: Record<string, unknown> = {
      organization_id: organizationId,
      status,
      current_period_end: attrs?.renews_at ?? attrs?.ends_at ?? null,
      trial_ends_at: attrs?.trial_ends_at ?? null,
    };
    if (tier) entitlement.tier = tier;
    if (status === 'canceled' || status === 'suspended') entitlement.tier = 'basic';

    const { error: entErr } = await supabase.from('organization_entitlements')
      .upsert(entitlement, { onConflict: 'organization_id' });
    if (entErr) throw entErr;

    await markProcessed(supabase, eventId, null);
    return json({ ok: true, organization_id: organizationId, status });
  } catch (e) {
    await markProcessed(supabase, eventId, (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});

async function markProcessed(supabase: any, eventId: string, error: string | null) {
  await supabase.from('billing_webhook_events')
    .update({ processed_at: new Date().toISOString(), error })
    .eq('provider', 'lemonsqueezy').eq('provider_event_id', eventId);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
