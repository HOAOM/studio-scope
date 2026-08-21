import { createClient } from "npm:@supabase/supabase-js@2";
import { findUserIdByEmail } from "../_shared/findUserByEmail.ts";

const EMAIL = "marcodenardi+gabriele2@gmail.com";

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: Record<string, unknown> = {};
  const uid = await findUserIdByEmail(sb, EMAIL);
  results["user_id"] = uid ?? "not_found";

  const del = async (label: string, p: Promise<{ error: unknown }>) => {
    const { error } = await p as { error: { message?: string } | null };
    results[label] = error?.message ?? "ok";
  };

  await del("organization_invites", sb.from("organization_invites").delete().eq("email", EMAIL));

  if (uid) {
    await del("user_roles", sb.from("user_roles").delete().eq("user_id", uid));
    await del("organization_members", sb.from("organization_members").delete().eq("user_id", uid));
    await del("project_assignments", sb.from("project_assignments").delete().eq("user_id", uid));
    await del("project_members", sb.from("project_members").delete().eq("user_id", uid));
    await del("notifications", sb.from("notifications").delete().eq("user_id", uid));
    await del("dm_sent", sb.from("direct_messages").delete().eq("sender_id", uid));
    await del("dm_received", sb.from("direct_messages").delete().eq("recipient_id", uid));
    await del("item_messages", sb.from("item_messages").delete().eq("sender_id", uid));
    await del("user_login_sessions", sb.from("user_login_sessions").delete().eq("user_id", uid));
    await del("security_flags", sb.from("security_flags").delete().eq("user_id", uid));
    await del("sso_tickets", sb.from("sso_tickets").delete().eq("user_id", uid));
    await del("audit_log", sb.from("audit_log").delete().eq("user_id", uid));
    await del("profiles", sb.from("profiles").delete().eq("id", uid));
    const { error } = await sb.auth.admin.deleteUser(uid);
    results["auth_user"] = error?.message ?? "deleted";
  }

  await del("email_send_log", sb.from("email_send_log").delete().eq("recipient_email", EMAIL));
  await del("suppressed_emails", sb.from("suppressed_emails").delete().eq("email", EMAIL));
  await del("unsubscribe_tokens", sb.from("email_unsubscribe_tokens").delete().eq("email", EMAIL));

  return new Response(JSON.stringify(results, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
