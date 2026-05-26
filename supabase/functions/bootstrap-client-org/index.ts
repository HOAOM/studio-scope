/**
 * bootstrap-client-org — super-admin creates a new client organization end-to-end.
 *
 * Flow:
 *  1. Auth: caller must have app_role='admin'.
 *  2. Validate body: { org_name, slug, owner_email, tier, discount_code?, send_invite_email? }
 *  3. Find or create auth user by email (auto-confirm).
 *  4. Insert organization + owner membership + subscription row.
 *  5. Optionally apply discount code.
 *  6. Issue a magic invite link via Supabase auth admin (redirect to /).
 *  7. Return { organization_id, owner_user_id, accept_url, magic_link, temp_password? }.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ALLOWED_TIERS = ["starter", "pro", "business"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthenticated" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: ures, error: uerr } = await userClient.auth.getUser();
  if (uerr || !ures.user) return json({ error: "unauthenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: ures.user.id,
    _role: "admin",
  });
  if (!isAdmin) return json({ error: "forbidden: admin only" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const org_name: string = String(body.org_name ?? "").trim();
  const slug_raw: string = String(body.slug ?? "").trim().toLowerCase();
  const slug = slug_raw.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 50);
  const owner_email: string = String(body.owner_email ?? "").trim().toLowerCase();
  const tier: string = String(body.tier ?? "starter").toLowerCase();
  const discount_code: string | undefined = body.discount_code?.trim();
  const send_invite_email: boolean = body.send_invite_email ?? true;

  if (!org_name || !slug || !owner_email) return json({ error: "missing_fields" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner_email)) return json({ error: "invalid_email" }, 400);
  if (!ALLOWED_TIERS.includes(tier as any)) return json({ error: "invalid_tier" }, 400);

  // 1. Find or create user
  const { data: users } = await admin.auth.admin.listUsers();
  let owner = users?.users?.find((u) => u.email?.toLowerCase() === owner_email);
  let tempPassword: string | undefined;
  if (!owner) {
    tempPassword = crypto.randomUUID().slice(0, 12) + "A1!";
    const { data: created, error: cerr } = await admin.auth.admin.createUser({
      email: owner_email,
      email_confirm: true,
      password: tempPassword,
    });
    if (cerr) return json({ error: "user_create_failed", detail: cerr.message }, 500);
    owner = created.user!;
  }

  // 2. Create organization (handle slug collision)
  let finalSlug = slug;
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await admin.from("organizations").select("id").eq("slug", finalSlug).maybeSingle();
    if (!existing) break;
    finalSlug = `${slug}-${Math.floor(Math.random() * 9999)}`;
  }
  const { data: org, error: oerr } = await admin
    .from("organizations")
    .insert({ name: org_name, slug: finalSlug })
    .select("id")
    .single();
  if (oerr) return json({ error: "org_create_failed", detail: oerr.message }, 500);

  // 3. Membership + subscription
  await admin.from("organization_members").insert({
    organization_id: org.id, user_id: owner.id, is_owner: true,
  });
  await admin.from("organization_subscriptions").insert({
    organization_id: org.id,
    tier,
    status: "active",
    current_period_end: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
  });

  // 4. Discount
  let discount_applied: any = null;
  if (discount_code) {
    const { data: applied } = await admin.rpc("redeem_discount", {
      p_code: discount_code, p_org: org.id,
    });
    discount_applied = applied;
  }

  // 5. Magic link
  const origin = req.headers.get("origin") ?? "";
  const siteUrl = origin.replace(/\/$/, "") ||
    Deno.env.get("SITE_URL") || "https://studio-scope.lovable.app";
  let magic_link: string | null = null;
  if (send_invite_email) {
    const { data: link } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: owner_email,
      options: { redirectTo: `${siteUrl}/` },
    });
    magic_link = link?.properties?.action_link ?? null;
  }

  return json({
    ok: true,
    organization_id: org.id,
    slug: finalSlug,
    owner_user_id: owner.id,
    magic_link,
    temp_password: tempPassword,
    discount_applied,
  });
});
