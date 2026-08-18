/**
 * run-secfix12-tests — verifica le nuove policy su audit_log e notifications
 * e il search_path fisso sulle funzioni tier_*. Richiede x-site-api-key.
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
    const PROJECT = "ed13b162-ae6f-4737-99e1-16ea500e9609";
    const ITEM = "c1ccddc4-a307-46e0-9d6a-29617b51069c";
    const CEO = "b5886e22-c5d6-4087-b8de-db53ef67c591"; // membro del progetto
    const OUTSIDER = "7ebdb5d6-d60f-4444-963b-6db10406f5ce"; // altra organizzazione
    const MEMBER = "designer@test.it";
    const FOREIGN = "marcodenardi+enrico@gmail.com";

    // --- audit_log ---
    await asUser(MEMBER, "membro: audit su item del proprio progetto", async (t) => {
      const [u] = await t`select auth.uid() as id`;
      return await t`insert into public.audit_log (entity_type, entity_id, action, user_id, summary)
        values ('item', ${ITEM}, 'secfix12_test', ${u.id}, 'SECFIX12-TEST ok') returning id`;
    });

    await asUser(MEMBER, "membro: audit con entity_id inesistente", async (t) => {
      const [u] = await t`select auth.uid() as id`;
      return await t`insert into public.audit_log (entity_type, entity_id, action, user_id, summary)
        values ('item', gen_random_uuid(), 'secfix12_test', ${u.id}, 'SECFIX12-TEST fake entity') returning id`;
    });

    await asUser(MEMBER, "membro: audit con entity_type arbitrario", async (t) => {
      const [u] = await t`select auth.uid() as id`;
      return await t`insert into public.audit_log (entity_type, entity_id, action, user_id, summary)
        values ('organization', ${ITEM}, 'secfix12_test', ${u.id}, 'SECFIX12-TEST wrong type') returning id`;
    });

    await asUser(MEMBER, "membro: audit a nome di un altro utente", (t) =>
      t`insert into public.audit_log (entity_type, entity_id, action, user_id, summary)
        values ('item', ${ITEM}, 'secfix12_test', ${CEO}, 'SECFIX12-TEST spoof') returning id`);

    await asUser(FOREIGN, "utente di altra org: audit su item non suo", async (t) => {
      const [u] = await t`select auth.uid() as id`;
      return await t`insert into public.audit_log (entity_type, entity_id, action, user_id, summary)
        values ('item', ${ITEM}, 'secfix12_test', ${u.id}, 'SECFIX12-TEST foreign') returning id`;
    });

    await asUser(MEMBER, "DEBUG predicati notifica", (t) =>
      t`select public.is_project_member(${PROJECT}::uuid) as sender_member,
               public.is_user_project_member(${PROJECT}::uuid, ${CEO}::uuid) as recipient_member`);

    // --- notifications ---
    await asUser(MEMBER, "membro: notifica mention a membro dello stesso progetto", (t) =>
      t`insert into public.notifications (user_id, type, title, body, project_id, item_id)
        values (${CEO}, 'mention', 'SECFIX12-TEST mention', 'ok', ${PROJECT}, ${ITEM}) returning id`);

    await asUser(MEMBER, "membro: notifica di tipo system_alert", (t) =>
      t`insert into public.notifications (user_id, type, title, body, project_id)
        values (${CEO}, 'system_alert', 'SECFIX12-TEST fake system', 'spoof', ${PROJECT}) returning id`);

    await asUser(MEMBER, "membro: notifica senza project_id", (t) =>
      t`insert into public.notifications (user_id, type, title, body)
        values (${CEO}, 'mention', 'SECFIX12-TEST no project', 'x') returning id`);

    await asUser(MEMBER, "membro: notifica a utente esterno al progetto", (t) =>
      t`insert into public.notifications (user_id, type, title, body, project_id)
        values (${OUTSIDER}, 'mention', 'SECFIX12-TEST outsider', 'x', ${PROJECT}) returning id`);

    await asUser(FOREIGN, "utente di altra org: notifica su progetto non suo", (t) =>
      t`insert into public.notifications (user_id, type, title, body, project_id)
        values (${CEO}, 'mention', 'SECFIX12-TEST foreign', 'x', ${PROJECT}) returning id`);

    // --- search_path ---
    const fns = await sql`
      select p.proname, p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname in
        ('tier_project_limit','tier_storage_limit_bytes','tier_storage_limit_gb')`;

    const mutable = await sql`
      select count(*)::int as n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public'
        and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path%')`;

    // cleanup
    await sql`delete from public.audit_log where action = 'secfix12_test'`;
    await sql`delete from public.notifications where title like 'SECFIX12-TEST%'`;

    return json({ ok: true, results, tier_functions: fns, functions_without_search_path: mutable[0].n });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message, results }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
