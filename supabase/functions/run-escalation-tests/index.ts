/**
 * run-escalation-tests — verifica le protezioni contro l'escalation di
 * privilegio. Ogni test gira in una transazione con ROLLBACK, impersonando
 * il ruolo `authenticated` con il claim sub dell'utente sotto test.
 *
 * Richiede x-site-api-key. Non modifica dati.
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
  const results: Record<string, unknown>[] = [];

  const asUser = async (uid: string, label: string, stmts: string[], setup: string[] = []) => {
    for (const stmt of stmts) {
      try {
        await sql.begin(async (tx) => {
          for (const s of setup) await tx.unsafe(s);
          await tx.unsafe(`SET LOCAL ROLE authenticated`);
          await tx.unsafe(
            `SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true)`,
          );
          const rows = await tx.unsafe(stmt);
          throw new Error(`__OK__${JSON.stringify(rows).slice(0, 200)}`);
        });
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.startsWith("__OK__")) {
          results.push({ actor: label, stmt, outcome: "ALLOWED", detail: msg.slice(6) });
        } else {
          results.push({ actor: label, stmt, outcome: "BLOCKED", error: msg });
        }
      }
    }
  };

  try {
    const [admin] = await sql`
      select u.id, u.email, om.organization_id, om.is_owner
      from auth.users u
      join public.organization_members om on om.user_id = u.id
      where lower(u.email) = 'admin@test.it' limit 1`;

    const [owner] = await sql`
      select u.id, u.email, om.organization_id
      from auth.users u
      join public.organization_members om on om.user_id = u.id
      where om.is_owner = true and u.id <> ${admin?.id ?? "00000000-0000-0000-0000-000000000000"}
      limit 1`;

    const [powner] = await sql`
      select pa.user_id, u.email from public.platform_admins pa
      join auth.users u on u.id = pa.user_id
      where pa.grade = 'owner' limit 1`;

    if (admin) {
      const org = admin.organization_id;
      await asUser(admin.id as string, `org admin ${admin.email}`, [
        `UPDATE public.organization_members SET is_owner = true WHERE user_id = '${admin.id}' AND organization_id = '${org}' RETURNING id`,
        `INSERT INTO public.organization_members (organization_id, user_id, is_owner) VALUES ('${org}','${admin.id}', true) RETURNING id`,
        `INSERT INTO public.user_roles (user_id, role, organization_id) VALUES ('${admin.id}','admin','${org}') RETURNING id`,
        `INSERT INTO public.platform_admins (user_id, grade) VALUES ('${admin.id}','owner') RETURNING id`,
        `SELECT public.platform_admin_set_grade('${admin.email}','owner')`,
        `INSERT INTO public.user_roles (user_id, role, organization_id) VALUES ('${admin.id}','designer','${org}') RETURNING id`,
      ], [
        // scenario: admin@test.it declassato a NON-owner (solo dentro la tx)
        `UPDATE public.organization_members SET is_owner = false WHERE user_id = '${admin.id}' AND organization_id = '${org}'`,
        `INSERT INTO public.user_roles (user_id, role, organization_id) VALUES ('${admin.id}','admin','${org}') ON CONFLICT DO NOTHING`,
      ]);
    }

    if (owner) {
      await asUser(owner.id as string, `org owner ${owner.email}`, [
        `INSERT INTO public.user_roles (user_id, role, organization_id) VALUES ('${owner.id}','designer','${owner.organization_id}') RETURNING id`,
        `UPDATE public.organization_members SET is_owner = true WHERE user_id = '${owner.id}' AND organization_id = '${owner.organization_id}' RETURNING id`,
      ]);
    }

    if (powner) {
      await asUser(powner.user_id as string, `platform owner ${powner.email}`, [
        `INSERT INTO public.platform_admins (user_id, grade) VALUES ('${admin?.id}','staff') RETURNING id`,
        `SELECT public.platform_admin_set_grade('${admin?.email}','staff')`,
      ]);
    }

    return json({
      ok: true,
      actors: { admin: admin?.email, owner: owner?.email, platform_owner: powner?.email },
      results,
    });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message, results }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
