/**
 * run-cleanup-prelaunch — one-off: removes the pre-launch validation test data
 * (2 test organizations + 3 test users). Platform admin only.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ORG_IDS = [
  "1cf45e3f-2502-4fac-a11f-5ece89657e16",
  "da914013-668c-4c1c-b61c-285c13246d91",
];
const EMAILS = [
  "prelaunch.owner+beta@test.it",
  "prelaunch.owner2+beta@test.it",
  "prelaunch.member+beta@test.it",
  "prelaunch.member2+beta@test.it",
];

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthenticated" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: isAdmin } = await userClient.rpc("is_platform_admin");
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const removed: Record<string, unknown> = {};
  for (const t of [
    "company_settings", "referral_codes", "organization_invites", "user_roles",
    "organization_members", "organization_subscriptions", "master_subcategories",
    "master_item_types", "master_rooms", "master_floors", "cost_categories",
    "organization_domains", "organization_domain_audit", "projects",
  ]) {
    const { error, count } = await sb.from(t).delete({ count: "exact" }).in("organization_id", ORG_IDS);
    removed[t] = error ? `error: ${error.message}` : count;
  }
  const { error: oerr, count: ocount } = await sb
    .from("organizations").delete({ count: "exact" }).in("id", ORG_IDS);
  removed["organizations"] = oerr ? `error: ${oerr.message}` : ocount;

  const { data: list } = await sb.auth.admin.listUsers();
  const users: string[] = [];
  for (const u of list?.users ?? []) {
    if (u.email && EMAILS.includes(u.email.toLowerCase())) {
      await sb.auth.admin.deleteUser(u.id);
      users.push(u.email);
    }
  }
  return json({ ok: true, removed, users_deleted: users });
});
