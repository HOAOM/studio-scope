// Temporaneo: verifica quali redirect URL vengono accettati da GoTrue.
// Genera un magic link (senza inviarlo) per ogni host di test e riporta il
// parametro redirect_to effettivamente presente nell'action_link.
// Se GoTrue rifiuta l'URL, l'action_link ricade sul SITE_URL di progetto.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const body = await req.json().catch(() => ({}));
  const email: string = body.email;
  const hosts: string[] = body.hosts ?? [];
  if (!email) return new Response(JSON.stringify({ error: "email required" }), { status: 400, headers: cors });

  const out: Record<string, unknown> = {};
  for (const h of hosts) {
    const target = `${h}/accept-invite?token=probe`;
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: target },
    });
    if (error) { out[h] = { error: error.message }; continue; }
    const link = (data as any)?.properties?.action_link ?? "";
    let effective = "";
    try { effective = new URL(link).searchParams.get("redirect_to") ?? ""; } catch { /* noop */ }
    out[h] = {
      requested: target,
      effective,
      accepted: effective.startsWith(h),
    };
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
