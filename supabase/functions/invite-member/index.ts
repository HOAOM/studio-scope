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
import { findUserIdByEmail } from "../_shared/findUserByEmail.ts";
import { getUnsubscribeToken } from "../_shared/unsubscribeToken.ts";

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

/** Valori validi dell'enum public.app_role — devono restare allineati a src/lib/roles.ts */
const APP_ROLES = [
  "admin", "designer", "accountant", "qs", "head_of_payments", "client", "ceo",
  "site_engineer", "project_manager", "procurement_manager", "mep_engineer",
  "coo", "head_of_design", "architectural_dept",
] as const;

const SITE_NAME = "Kroneel";
const FROM_DOMAIN = "kroneel.com";
const SENDER_DOMAIN = "notify.kroneel.com";

function inviteEmailHtml(orgName: string, url: string): string {
  return `<!doctype html><html lang="it"><body style="background:#ffffff;font-family:Helvetica,Arial,sans-serif;margin:0">
  <div style="max-width:520px;padding:32px 28px">
    <p style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#111;margin:0 0 28px">${SITE_NAME}</p>
    <h1 style="font-size:22px;font-weight:600;color:#111;margin:0 0 20px">Sei stato invitato</h1>
    <p style="font-size:15px;color:#4a4a4a;line-height:1.6;margin:0 0 22px">
      Sei stato invitato a unirti a <strong>${orgName}</strong> su ${SITE_NAME}.
      Clicca sul pulsante qui sotto per accedere e accettare l'invito.
    </p>
    <a href="${url}" style="background:#111;color:#fff;font-size:14px;border-radius:4px;padding:13px 22px;text-decoration:none;display:inline-block">Accedi e accetta l'invito</a>
    <p style="font-size:12px;color:#9a9a9a;line-height:1.6;margin:34px 0 0">
      Se non ti aspettavi questo invito, puoi ignorare questa email.
    </p>
  </div></body></html>`;
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

  if (!organization_id || !email) return json({ error: "missing_fields" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid_email" }, 400);
  if (!(APP_ROLES as readonly string[]).includes(base_role)) {
    return json({
      error: "invalid_role",
      detail: `Ruolo non valido: "${base_role || "(vuoto)"}". Seleziona uno dei ruoli disponibili (${APP_ROLES.join(", ")}).`,
    }, 400);
  }

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
    // Limite posti del piano (bypass per i platform admin)
    if (!isPlatform) {
      const [{ data: limits }, { data: seatsUsed }] = await Promise.all([
        admin.rpc("get_tier_limits", { p_org: organization_id }),
        admin.rpc("org_seat_count", { p_org: organization_id, p_include_invites: true }),
      ]);
      const maxSeats = (limits as any)?.max_seats ?? null;
      if (maxSeats != null && Number(seatsUsed) >= Number(maxSeats)) {
        return json({
          error: "seat_limit_reached",
          detail: `Limite posti raggiunto per il piano attuale (${seatsUsed} / ${maxSeats} posti occupati). Serve un upgrade di piano per invitare altre persone.`,
        }, 409);
      }
    }

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
    if (insErr) {
      const seat = /Limite posti/i.test(insErr.message);
      return json(
        { error: seat ? "seat_limit_reached" : "invite_insert_failed", detail: insErr.message },
        seat ? 409 : 500,
      );
    }
    inviteId = inserted!.id;
    inviteToken = inserted!.token;
  }


  // Resolve site URL for redirect
  const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
  const siteUrl = origin.replace(/\/$/, "") ||
    Deno.env.get("SITE_URL") || "https://studio-scope.lovable.app";
  const acceptUrl = `${siteUrl}/accept-invite?token=${inviteToken}`;

  // Send magic link if user does not exist; otherwise send a real invite email
  // with a fresh magic link (re-invite after revoke, second organization, ...).
  const existingUserId = await findUserIdByEmail(admin, email);

  const { data: orgRow } = await admin
    .from("organizations").select("name").eq("id", organization_id).maybeSingle();
  const orgName = orgRow?.name ?? "the organization";

  let emailSent = false;
  if (!existingUserId) {
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: acceptUrl,
      data: { must_set_password: true },
    });
    emailSent = !inviteErr;
  } else {
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: acceptUrl },
    });
    const actionLink = (link as any)?.properties?.action_link;
    if (!linkErr && actionLink) {
      const messageId = crypto.randomUUID();
      const unsubscribeToken = await getUnsubscribeToken(admin, email);
      await admin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "org_invite",
        recipient_email: email,
        status: "pending",
      });
      const { error: qErr } = await admin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          // L'API email richiede run_id (auth) oppure idempotency_key
          // (app/transactional): senza questo il send fallisce con 400 e
          // l'invito a un utente già esistente non arriva mai.
          idempotency_key: `org_invite:${inviteId}:${Date.now()}`,
          to: email,
          from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject: `Sei stato invitato a unirti a ${orgName}`,
          html: inviteEmailHtml(orgName, actionLink),
          text: `Sei stato invitato a unirti a ${orgName} su ${SITE_NAME}. Accedi qui: ${actionLink}`,
          purpose: "transactional",
          // Obbligatorio per le email transazionali: senza, l'API risponde
          // 400 missing_unsubscribe e il messaggio finisce in DLQ.
          unsubscribe_token: unsubscribeToken,
          label: "org_invite",
          queued_at: new Date().toISOString(),
        },
      });
      emailSent = !qErr;
    }
  }

  return json({
    ok: true,
    invite_id: inviteId,
    accept_url: acceptUrl,
    email_sent: emailSent,
    existing_user: !!existingUserId,
  });
});
