/**
 * run-secfix13-tests — verifica lato server delle regole di workflow
 * (trigger su project_items) e della lettura di tier_limits.
 * Tutto in transazione con ROLLBACK: nessun dato residuo.
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
  const results: unknown[] = [];

  const run = async (
    tx: postgres.TransactionSql,
    name: string,
    userId: string,
    query: string,
    params: unknown[] = [],
  ) => {
    try {
      await tx.savepoint(async (sp) => {
        await sp.unsafe(`set local role authenticated`);
        await sp.unsafe(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: userId, role: "authenticated" }),
        ]);
        const rows = await sp.unsafe(query, params as never[]);
        results.push({ test: name, outcome: "ALLOWED", rows: rows.length });
        await sp.unsafe(`reset role`);
      });
    } catch (e) {
      results.push({ test: name, outcome: "BLOCKED", error: (e as Error).message.slice(0, 200) });
    }
  };

  try {
    await sql
      .begin(async (tx) => {
        // setup: org, subscription, progetto, item, due utenti (designer + ceo)
        const [org] = await tx.unsafe(
          `insert into public.organizations (name, slug) values ('SecFix13 Test','secfix13-test-' || substr(md5(random()::text),1,8)) returning id`,
        );
        const orgId = (org as { id: string }).id;
        await tx.unsafe(
          `insert into public.organization_subscriptions (organization_id, tier, status, current_period_end)
           values ($1,'pro','active', now() + interval '365 days')`,
          [orgId],
        );

        const [designer] = await tx.unsafe(
          `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
           values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000','authenticated','authenticated','sec13-designer-' || substr(md5(random()::text),1,8) || '@test.local','x', now(), now(), now()) returning id`,
        );
        const [ceo] = await tx.unsafe(
          `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
           values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000','authenticated','authenticated','sec13-ceo-' || substr(md5(random()::text),1,8) || '@test.local','x', now(), now(), now()) returning id`,
        );
        const designerId = (designer as { id: string }).id;
        const ceoId = (ceo as { id: string }).id;

        await tx.unsafe(
          `insert into public.organization_members (organization_id, user_id, is_owner) values ($1,$2,false), ($1,$3,false)`,
          [orgId, designerId, ceoId],
        );
        await tx.unsafe(
          `insert into public.user_roles (user_id, role, organization_id) values ($1,'designer',$3), ($2,'ceo',$3)`,
          [designerId, ceoId, orgId],
        );

        const [proj] = await tx.unsafe(
          `insert into public.projects (owner_id, organization_id, code, name, client, start_date, target_completion_date)
           values ($1,$2,'SEC13','SecFix13','Client', current_date, current_date + 30) returning id`,
          [ceoId, orgId],
        );
        const projectId = (proj as { id: string }).id;
        await tx.unsafe(
          `insert into public.project_members (project_id, user_id, role) values ($1,$2,'designer'), ($1,$3,'ceo')`,
          [projectId, designerId, ceoId],
        );

        const [item] = await tx.unsafe(
          `insert into public.project_items (project_id, category, area, description, lifecycle_status)
           values ($1,'FX','Area','Test item','quotation_approved_ops') returning id`,
          [projectId],
        );
        const itemId = (item as { id: string }).id;

        await run(tx, "designer → quotation_approved_high (deve essere BLOCCATO)", designerId,
          `update public.project_items set lifecycle_status = 'quotation_approved_high' where id = $1`, [itemId]);

        await run(tx, "designer → salto arbitrario a payment_executed (deve essere BLOCCATO)", designerId,
          `update public.project_items set lifecycle_status = 'payment_executed' where id = $1`, [itemId]);

        await run(tx, "designer → cambio approval_status (deve essere BLOCCATO)", designerId,
          `update public.project_items set approval_status = 'approved' where id = $1`, [itemId]);

        await run(tx, "designer → modifica campo non gated (deve essere CONSENTITO)", designerId,
          `update public.project_items set notes = 'ok' where id = $1`, [itemId]);

        await run(tx, "ceo → quotation_approved_high (deve essere CONSENTITO)", ceoId,
          `update public.project_items set lifecycle_status = 'quotation_approved_high' where id = $1`, [itemId]);

        await run(tx, "designer → lettura tier_limits del proprio piano", designerId,
          `select tier from public.tier_limits`);

        throw new Error("ROLLBACK_OK");
      })
      .catch((e) => {
        if ((e as Error).message !== "ROLLBACK_OK") throw e;
      });

    return json({ ok: true, results });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message, results }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
