// public-onboarding — public, key-less endpoint for the marketing site.
//
// Two actions (POST):
//   { action: "validate_code", code, kind: "discount"|"referral", tier }
//   { action: "provision", org_name, owner_email, tier,
//     domain_choice: "custom"|"subdomain"|"buy", custom_domain?, subdomain?,
//     discount_code?, referral_code? }
//
// Runs with the service role so the SITE_API_KEY never reaches the browser.
// Each client gets its own organization; data is isolated by organization_id + RLS.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BASE_DOMAIN = (Deno.env.get("PUBLIC_BASE_DOMAIN") ?? "studio-scope.lovable.app").trim();

const ALLOWED_TIERS = ["starter", "pro", "business"] as const;
type Tier = (typeof ALLOWED_TIERS)[number];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const admin = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || `org-${Math.random().toString(36).slice(2, 8)}`
  );
}

async function uniqueSlug(sb: ReturnType<typeof admin>, base: string) {
  let slug = slugify(base);
  let n = 0;
  while (true) {
    const { data } = await sb.from("organizations").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    n += 1;
    slug = `${slugify(base)}-${n}`;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

// Light, pre-signup discount validation (no org yet, so no "already_redeemed").
async function validateDiscount(sb: ReturnType<typeof admin>, code: string, tier: Tier) {
  const { data: r } = await sb
    .from("discount_codes")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (!r) return { valid: false, reason: "not_found" };
  if (!r.is_active) return { valid: false, reason: "inactive" };
  if (r.valid_from && new Date(r.valid_from) > new Date()) return { valid: false, reason: "not_yet_valid" };
  if (r.valid_until && new Date(r.valid_until) < new Date()) return { valid: false, reason: "expired" };
  if (r.scope_tier && r.scope_tier !== tier) return { valid: false, reason: "wrong_tier" };
  if (r.max_redemptions != null && r.total_redemptions >= r.max_redemptions)
    return { valid: false, reason: "exhausted" };
  return { valid: true, reason: "ok", percent_off: r.percent_off, amount_off: r.amount_off };
}

async function validateReferral(sb: ReturnType<typeof admin>, code: string) {
  const { data: r } = await sb
    .from("referral_codes")
    .select("id, is_active")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (!r) return { valid: false, reason: "not_found" };
  if (!r.is_active) return { valid: false, reason: "inactive" };
  return { valid: true, reason: "ok" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const sb = admin();

  try {
    // ── validate_code ──────────────────────────────────────────────
    if (body.action === "validate_code") {
      const code = String(body.code ?? "").trim();
      const tier = String(body.tier ?? "starter").toLowerCase() as Tier;
      if (!code) return json({ valid: false, reason: "empty" });
      if (!ALLOWED_TIERS.includes(tier)) return json({ valid: false, reason: "invalid_tier" });
      if (body.kind === "referral") return json(await validateReferral(sb, code));
      return json(await validateDiscount(sb, code, tier));
    }

    // ── provision ──────────────────────────────────────────────────
    if (body.action === "provision") {
      const org_name = String(body.org_name ?? "").trim();
      const owner_email = String(body.owner_email ?? "").trim().toLowerCase();
      const tier = String(body.tier ?? "starter").toLowerCase() as Tier;
      const domain_choice = String(body.domain_choice ?? "subdomain").toLowerCase();
      const discount_code = body.discount_code ? String(body.discount_code).trim() : null;
      const referral_code = body.referral_code ? String(body.referral_code).trim() : null;

      if (!org_name) return json({ error: "missing_org_name" }, 400);
      if (!EMAIL_RE.test(owner_email)) return json({ error: "invalid_email" }, 400);
      if (!ALLOWED_TIERS.includes(tier)) return json({ error: "invalid_tier" }, 400);

      // Resolve domain
      const slugBase = await uniqueSlug(sb, org_name);
      let custom_domain: string | null = null;
      let dns_instructions: any = null;
      if (domain_choice === "custom") {
        const d = String(body.custom_domain ?? "").trim().toLowerCase();
        if (!DOMAIN_RE.test(d)) return json({ error: "invalid_domain" }, 400);
        custom_domain = d;
        dns_instructions = {
          type: "CNAME",
          host: d,
          points_to: BASE_DOMAIN,
          note: "Crea un record CNAME presso il tuo provider DNS che punta a questo host. La propagazione può richiedere fino a 24h.",
        };
      } else if (domain_choice === "subdomain") {
        const sub = slugify(String(body.subdomain ?? slugBase));
        custom_domain = `${sub}.${BASE_DOMAIN}`;
      }
      // "buy" → no domain yet (affiliate flow, later phase)

      // 1) user — an existing account must NEVER be attached to an organization
      //    created by an unauthenticated request (account hijack / code burning).
      //    In that case we only send a sign-in link and return a generic response
      //    that does not reveal whether the address is registered.
      const { data: list } = await sb.auth.admin.listUsers();
      const existing = list?.users?.find((u) => u.email?.toLowerCase() === owner_email);
      if (existing) {
        const originExisting = req.headers.get("origin") ?? "";
        const siteUrlExisting = originExisting.replace(/\/$/, "") || `https://${BASE_DOMAIN}`;
        const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        await anon.auth.signInWithOtp({
          email: owner_email,
          options: { emailRedirectTo: `${siteUrlExisting}/dashboard` },
        });
        return json({ ok: true, pending_email_verification: true, email_sent: true });
      }

      // New address: create the account unconfirmed — it only becomes usable
      // once the real owner clicks the link sent to that inbox.
      const tempPassword = crypto.randomUUID().slice(0, 16) + "A1!";
      const { data: created, error: cerr } = await sb.auth.admin.createUser({
        email: owner_email,
        email_confirm: false,
        password: tempPassword,
      });
      if (cerr || !created?.user) return json({ error: "user_create_failed" }, 500);
      const owner = created.user;

      // 2) organization
      const { data: org, error: oerr } = await sb
        .from("organizations")
        .insert({ name: org_name, slug: slugBase, custom_domain })
        .select("id, slug, custom_domain")
        .single();
      if (oerr) return json({ error: "org_create_failed", detail: oerr.message }, 500);

      // 3) membership (idempotent-ish) + subscription
      await sb.from("organization_members").insert({
        organization_id: org.id,
        user_id: owner.id,
        is_owner: true,
      });

      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);
      await sb.from("organization_subscriptions").insert({
        organization_id: org.id,
        tier,
        status: "active",
        current_period_end: periodEnd.toISOString(),
      });

      // 4) referral + discount (best-effort)
      let referral_applied = false;
      let discount_applied = false;
      if (referral_code) {
        const { data } = await sb.rpc("apply_referral", { p_code: referral_code, p_org: org.id });
        referral_applied = !!data;
      }
      if (discount_code) {
        const { data } = await sb.rpc("redeem_discount", { p_code: discount_code, p_org: org.id });
        discount_applied = !!data;
      }

      // 5) magic link — sent ONLY to the owner's inbox, never returned in the
      //    response (this endpoint is public and unauthenticated, so returning
      //    the link would let anyone hijack an account by typing someone
      //    else's email address).
      const origin = req.headers.get("origin") ?? "";
      const siteUrl = origin.replace(/\/$/, "") || `https://${BASE_DOMAIN}`;
      let email_sent = false;
      const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: otpErr } = await anonClient.auth.signInWithOtp({
        email: owner_email,
        options: { emailRedirectTo: `${siteUrl}/dashboard` },
      });
      email_sent = !otpErr;

      return json({
        ok: true,
        organization_id: org.id,
        slug: org.slug,
        custom_domain: org.custom_domain,
        created_user,
        referral_applied,
        discount_applied,
        email_sent,
        dns_instructions,
      });

    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: "internal_error", detail: String(e) }, 500);
  }
});
