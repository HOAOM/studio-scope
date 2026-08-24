/**
 * invite-member — invito di un membro a un'organizzazione.
 *
 * Autorizzazione: `effectiveOwnerContext()` (owner reale, org admin, oppure
 * platform admin in View-as/console che eredita i diritti dell'owner).
 * Invio: `sendOrgInvite()` — unico punto di verità per link, dominio, gate
 * password e email di re-invito.
 *
 * Body: { organization_id, email, base_role, is_owner?, console_intent? }
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { assertOrgContext, effectiveOwnerContext } from "../_shared/orgContext.ts";
import {
  APP_ROLES,
  isValidAppRole,
  isValidInviteEmail,
  sendOrgInvite,
} from "../_shared/sendOrgInvite.ts";

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
  const base_role: string = String(body.base_role ?? "").trim();
  const is_owner: boolean = !!body.is_owner;
  const consoleIntent: boolean = body.console_intent === true;

  if (!organization_id || !email) return json({ error: "missing_fields" }, 400);
  if (!isValidInviteEmail(email)) return json({ error: "invalid_email" }, 400);
  if (!isValidAppRole(base_role)) {
    return json({
      error: "invalid_role",
      detail: `Ruolo non valido: "${base_role || "(vuoto)"}". Seleziona uno dei ruoli disponibili (${APP_ROLES.join(", ")}).`,
    }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Autorizzazione: un solo helper, stesso principio ovunque ──
  const ctx = await effectiveOwnerContext(admin, {
    userId: caller.id,
    organizationId: organization_id,
    consoleIntent,
  });

  if (!ctx.hasAdminRights) {
    return json({ error: "forbidden: not org owner" }, 403);
  }

  // Contesto ambiguo: platform admin non membro, senza View-as né console.
  try {
    await assertOrgContext(admin, {
      userId: caller.id,
      targetOrgId: organization_id,
      isPlatformAdmin: ctx.isPlatformAdmin,
      isOrgMember: ctx.isOrgMember,
      consoleIntent,
    });
  } catch (e: any) {
    return json({ error: e.code ?? "forbidden", detail: e.message }, e.status ?? 403);
  }

  // Il ruolo protetto 'admin' resta riservato a chi ha i diritti dell'owner.
  if (base_role === "admin" && !ctx.hasOwnerRights) {
    return json({
      error: "forbidden: owner_only_role",
      detail: "Solo il proprietario dell'organizzazione può invitare un utente con ruolo admin.",
    }, 403);
  }

  // ── Limite posti del piano (bypass per il livello piattaforma) ──
  if (!ctx.isPlatformAdmin) {
    const { data: pending } = await admin
      .from("organization_invites")
      .select("id")
      .eq("organization_id", organization_id)
      .ilike("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (!pending) {
      const [{ data: limits }, { data: seatsUsed }] = await Promise.all([
        admin.rpc("get_tier_limits", { p_org: organization_id }),
        admin.rpc("org_seat_count", { p_org: organization_id, p_include_invites: true }),
      ]);
      const maxSeats = (Array.isArray(limits) ? limits[0] : limits)?.max_seats ?? null;
      if (maxSeats != null && Number(seatsUsed) >= Number(maxSeats)) {
        return json({
          error: "seat_limit_reached",
          detail: `Limite posti raggiunto per il piano attuale (${seatsUsed} / ${maxSeats} posti occupati). Serve un upgrade di piano per invitare altre persone.`,
        }, 409);
      }
    }
  }

  const result = await sendOrgInvite(admin, {
    organizationId: organization_id,
    email,
    baseRole: base_role,
    isOwner: is_owner,
    invitedBy: caller.id,
    req,
  });

  if (result.error) {
    const seat = /Limite posti/i.test(result.error);
    return json(
      { error: seat ? "seat_limit_reached" : "invite_insert_failed", detail: result.error },
      seat ? 409 : 500,
    );
  }

  return json({
    ok: true,
    invite_id: result.invite_id,
    accept_url: result.accept_url,
    email_sent: result.email_sent,
    existing_user: result.existing_user,
  });
});
