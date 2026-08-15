/**
 * run-company-settings-tests — verifica isolamento per-organizzazione di
 * company_settings impersonando utenti reali via RLS (role authenticated +
 * request.jwt.claims). Richiede x-site-api-key.
 */
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-site-api-key",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const key = req.headers.get("x-site-api-key");
  if (!key || key !== Deno.env.get("SITE_API_KEY")) return json({ error: "forbidden" }, 403);

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  const results: any[] = [];

  const asUser = async (email: string, label: string, fn: (t: any) => Promise<any>) => {
    try {
      const out = await sql.begin(async (t) => {
        const [u] = await t`select id from auth.users where email = ${email}`;
        if (!u) throw new Error(`user ${email} not found`);
        await t.unsafe(`set local role authenticated`);
        await t.unsafe(
          `set local request.jwt.claims = '${JSON.stringify({ sub: u.id, role: "authenticated", email })}'`,
        );
        return await fn(t);
      });
      results.push({ test: label, user: email, outcome: "ALLOWED", data: out });
    } catch (err) {
      results.push({ test: label, user: email, outcome: "BLOCKED", error: (err as Error).message });
    }
  };

  try {
    const [org1] = await sql`select id from public.organizations where slug='studio-scope'`;
    const [org2] = await sql`select id from public.organizations where slug='test-studio-due'`;

    await asUser("admin@test.it", "admin org1 legge settings propria org", (t) =>
      t`select company_name, vat_number from public.company_settings where organization_id = ${org1.id}`);

    await asUser("admin@test.it", "admin org1 legge settings org2", (t) =>
      t`select company_name from public.company_settings where organization_id = ${org2.id}`);

    await asUser("admin@test.it", "admin org1 MODIFICA settings org2", async (t) => {
      const r = await t`update public.company_settings set company_name='HACKED'
        where organization_id = ${org2.id} returning company_name`;
      if (r.length === 0) throw new Error("update bloccato da RLS: 0 righe aggiornate");
      return r;
    });

    await asUser("admin@test.it", "admin org1 modifica settings propria org", async (t) => {
      const r = await t`update public.company_settings set phone='+971 000'
        where organization_id = ${org1.id} returning company_name, phone`;
      if (r.length === 0) throw new Error("update bloccato da RLS: 0 righe aggiornate");
      return r;
    });

    await asUser("designer@test.it", "designer org1 legge settings propria org", (t) =>
      t`select company_name from public.company_settings where organization_id = ${org1.id}`);

    await asUser("designer@test.it", "designer org1 MODIFICA settings propria org", async (t) => {
      const r = await t`update public.company_settings set company_name='DESIGNER-HACK'
        where organization_id = ${org1.id} returning company_name`;
      if (r.length === 0) throw new Error("update bloccato da RLS: 0 righe aggiornate");
      return r;
    });

    const final = await sql`
      select o.slug, cs.company_name, cs.vat_number
      from public.company_settings cs join public.organizations o on o.id = cs.organization_id
      order by o.created_at`;

    return json({ ok: true, results, final_state: final });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message, results }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
