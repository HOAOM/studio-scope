/**
 * sendOrgInvite — UNICO punto di verità per la creazione di un accesso a
 * un'organizzazione via email (invito membro o attivazione owner).
 *
 * Perché esiste: prima di questo helper c'erano 6 percorsi diversi che
 * creavano utenti/inviti (invite-member, admin-users, admin-set-user-password,
 * bootstrap-client-org, public-onboarding, site-api), ognuno con regole diverse
 * su: gate password, host di atterraggio, riuso di un invito pendente, email di
 * re-invito per utenti già esistenti. Il risultato erano bug scoperti uno alla
 * volta (invito senza gate password, link sul dominio sbagliato, secondo invito
 * che non manda nulla).
 *
 * Garanzie fornite da questa funzione, valide per TUTTI i chiamanti:
 *  1. Host di atterraggio = quello dell'organizzazione target (orgSiteUrl),
 *     mai l'origin del chiamante (fondamentale in View-as / super-admin).
 *  2. Utente nuovo  -> inviteUserByEmail con `must_set_password: true`
 *     (gate /set-password obbligatorio).
 *  3. Utente esistente senza password propria -> il flag viene ri-applicato.
 *  4. Utente esistente -> magic link reale accodato come email transazionale
 *     (così il 2°, 3°, n-esimo invito arriva davvero).
 *  5. Invito pendente già presente -> riuso del token, mai duplicati.
 */
import { orgSiteUrl } from "./orgSiteUrl.ts";
import { findUserIdByEmail } from "./findUserByEmail.ts";
import { getUnsubscribeToken } from "./unsubscribeToken.ts";

const SITE_NAME = "Kroneel";
const FROM_DOMAIN = "kroneel.com";
const SENDER_DOMAIN = "notify.kroneel.com";

/** Valori validi dell'enum public.app_role — allineati a src/lib/roles.ts */
export const APP_ROLES = [
  "admin", "designer", "accountant", "qs", "head_of_payments", "client", "ceo",
  "site_engineer", "project_manager", "procurement_manager", "mep_engineer",
  "coo", "head_of_design", "architectural_dept",
] as const;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidInviteEmail(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 255;
}

export function isValidAppRole(role: string): boolean {
  return (APP_ROLES as readonly string[]).includes(role);
}

export function randomInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function inviteEmailHtml(orgName: string, url: string, heading?: string): string {
  return `<!doctype html><html lang="it"><body style="background:#ffffff;font-family:Helvetica,Arial,sans-serif;margin:0">
  <div style="max-width:520px;padding:32px 28px">
    <p style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#111;margin:0 0 28px">${SITE_NAME}</p>
    <h1 style="font-size:22px;font-weight:600;color:#111;margin:0 0 20px">${heading ?? "Sei stato invitato"}</h1>
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

export interface SendOrgInviteInput {
  organizationId: string;
  email: string;
  /** Obbligatorio in mode 'invite'. */
  baseRole?: string;
  isOwner?: boolean;
  invitedBy?: string | null;
  isComplimentary?: boolean;
  complimentaryReason?: string | null;
  isOverTierLimit?: boolean;
  /** 'invite' = riga in organization_invites + /accept-invite.
   *  'owner_activation' = nessun invito, l'utente è già owner/membro. */
  mode?: "invite" | "owner_activation";
  /** Path di atterraggio per 'owner_activation' (default '/'). */
  landingPath?: string;
  /** Usato solo quando l'org non ha ancora un dominio attivo (onboarding pubblico). */
  siteUrlOverride?: string | null;
  req?: Request;
}

export interface SendOrgInviteResult {
  invite_id: string | null;
  accept_url: string;
  email_sent: boolean;
  existing_user: boolean;
  user_id: string | null;
  /** Popolato solo se il chiamante deve mostrarlo (super-admin console). */
  magic_link: string | null;
  error?: string;
}

/**
 * Invia (o riusa) un accesso all'organizzazione. Non esegue controlli di
 * autorizzazione: quelli restano del chiamante (assertOrgContext /
 * effectiveOwnerContext).
 */
export async function sendOrgInvite(
  admin: any,
  input: SendOrgInviteInput,
): Promise<SendOrgInviteResult> {
  const mode = input.mode ?? "invite";
  const email = input.email.trim().toLowerCase();
  const orgId = input.organizationId;

  const siteUrl =
    input.siteUrlOverride ??
    (await orgSiteUrl(admin, orgId, input.req ?? new Request("https://kroneel.com")));

  const { data: orgRow } = await admin
    .from("organizations").select("name").eq("id", orgId).maybeSingle();
  const orgName = orgRow?.name ?? "the organization";

  let inviteId: string | null = null;
  let landingUrl = `${siteUrl}${input.landingPath ?? "/"}`;

  if (mode === "invite") {
    const { data: existingInvite } = await admin
      .from("organization_invites")
      .select("id, token, status")
      .eq("organization_id", orgId)
      .ilike("email", email)
      .eq("status", "pending")
      .maybeSingle();

    let token = existingInvite?.token ?? randomInviteToken();
    inviteId = existingInvite?.id ?? null;

    if (!existingInvite) {
      const { data: inserted, error: insErr } = await admin
        .from("organization_invites")
        .insert({
          organization_id: orgId,
          email,
          base_role: input.baseRole,
          is_owner: !!input.isOwner,
          invited_by: input.invitedBy ?? null,
          token,
          is_complimentary: input.isComplimentary ?? false,
          complimentary_reason: input.complimentaryReason ?? null,
          is_over_tier_limit: input.isOverTierLimit ?? false,
        })
        .select("id, token")
        .single();
      if (insErr) {
        return {
          invite_id: null,
          accept_url: "",
          email_sent: false,
          existing_user: false,
          user_id: null,
          magic_link: null,
          error: insErr.message,
        };
      }
      inviteId = inserted.id;
      token = inserted.token;
    }
    landingUrl = `${siteUrl}/accept-invite?token=${token}`;
  }

  const existingUserId = await findUserIdByEmail(admin, email);
  let emailSent = false;
  let magicLink: string | null = null;

  if (!existingUserId) {
    // Utente nuovo: l'invito Supabase crea l'account e impone il gate password.
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: landingUrl,
      data: { must_set_password: true },
    });
    emailSent = !inviteErr;
  } else {
    // Account esistente creato da un invito mai completato: il gate va rimesso.
    const { data: hasPassword } = await admin.rpc("user_has_password", {
      _user_id: existingUserId,
    });
    if (hasPassword === false) {
      await admin.auth.admin.updateUserById(existingUserId, {
        user_metadata: { must_set_password: true },
      });
    }

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: landingUrl },
    });
    magicLink = (link as any)?.properties?.action_link ?? null;
    if (!linkErr && magicLink) {
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
          idempotency_key: `org_invite:${inviteId ?? orgId}:${Date.now()}`,
          to: email,
          from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject: `Sei stato invitato a unirti a ${orgName}`,
          html: inviteEmailHtml(orgName, magicLink),
          text: `Sei stato invitato a unirti a ${orgName} su ${SITE_NAME}. Accedi qui: ${magicLink}`,
          purpose: "transactional",
          unsubscribe_token: unsubscribeToken,
          label: "org_invite",
          queued_at: new Date().toISOString(),
        },
      });
      emailSent = !qErr;
    }
  }

  return {
    invite_id: inviteId,
    accept_url: landingUrl,
    email_sent: emailSent,
    existing_user: !!existingUserId,
    user_id: existingUserId ?? null,
    magic_link: magicLink,
  };
}
