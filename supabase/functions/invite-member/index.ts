/**
 * invite-member — owner of an organization invites a member by email.
 *
 * Flow:
 *  1. Auth: caller must be owner of `organization_id` (or global admin).
 *  2. Create / lookup auth user by email.
 *  3. Insert row in `organization_invites` with random token.
 *  4. If user does NOT exist yet → send Supabase invite (magic link)
 *     pointing at `${SITE_URL}/accept-invite?token=...`.
 *  5. If user exists → just return the accept URL (caller can copy it
 *     or we send a notification email later via the email system).
 *
 * Body: { organization_id: uuid, email: string, base_role?: string, is_owner?: bool }
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

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes.user) return json({ error: "unauthenticated" }, 401);
  const caller = userRes.user;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const organization_id: string = body.organization_id;
  const email: string = String(body.email ?? "").trim().toLowerCase();
  const base_role: string = body.base_role ?? "member";
  const is_owner: boolean = !!body.is_owner;

  if (!organization_id || !email) return json({ error: "missing_fields" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid_email" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Authorisation: owner/admin OF THIS org, or platform admin.
  // A client admin of another organization must never pass this check.
  const { data: ownerCheck } = await admin
    .from("organization_members")
    .select("is_owner")
    .eq("organization_id", organization_id)
    .eq("user_id", caller.id)
    .maybeSingle();

  const { data: orgAdminRow } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", caller.id)
    .eq("organization_id", organization_id)
    .eq("role", "admin")
    .maybeSingle();

  const { data: isPlatform } = await admin.rpc("is_platform_admin", {
    _user_id: caller.id,
  });

  if (!isPlatform && !orgAdminRow && !ownerCheck?.is_owner) {
    return json({ error: "forbidden: not org owner" }, 403);
  }

  // Make sure invite is not duplicate-pending
  const { data: existingInvite } = await admin
    .from("organization_invites")
    .select("id, token, status")
    .eq("organization_id", organization_id)
    .ilike("email", email)
    .eq("status", "pending")
    .maybeSingle();

  let inviteToken = existingInvite?.token ?? randomToken();
  let inviteId = existingInvite?.id;

  if (!existingInvite) {
    const { data: inserted, error: insErr } = await admin
      .from("organization_invites")
      .insert({
        organization_id,
        email,
        base_role,
        is_owner,
        invited_by: caller.id,
        token: inviteToken,
      })
      .select("id, token")
      .single();
    if (insErr) return json({ error: "invite_insert_failed", detail: insErr.message }, 500);
    inviteId = inserted!.id;
    inviteToken = inserted!.token;
  }

  // Resolve site URL for redirect
  const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
  const siteUrl = origin.replace(/\/$/, "") ||
    Deno.env.get("SITE_URL") || "https://studio-scope.lovable.app";
  const acceptUrl = `${siteUrl}/accept-invite?token=${inviteToken}`;

  // Send magic link if user does not exist; otherwise just return URL
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find(
    (u) => u.email?.toLowerCase() === email,
  );

  let emailSent = false;
  if (!existingUser) {
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: acceptUrl,
    });
    emailSent = !inviteErr;
  }

  return json({
    ok: true,
    invite_id: inviteId,
    accept_url: acceptUrl,
    email_sent: emailSent,
    existing_user: !!existingUser,
  });
});
