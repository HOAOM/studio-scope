/**
 * run-tier-masterdata-tests — verifica:
 *  1. i limiti reali applicati per i piani basic / advanced / pro
 *     (progetti attivi, utenti per ruolo, storage, addon dichiarati);
 *  2. che un admin di un'organizzazione non possa scrivere le anagrafiche
 *     master di un'altra organizzazione.
 *
 * Tutto avviene in un'unica transazione con ROLLBACK finale: nessun dato
 * resta nel database. Gate: header x-migration-token o x-site-api-key.
 */
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-site-api-key, x-migration-token",
};

const TOKEN = "mig-tiers-real-2026-08-18-7f3a1c";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ROLLBACK = "__ROLLBACK__";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const token = req.headers.get("x-migration-token");
  const siteKey = req.headers.get("x-site-api-key");
  if (!(token === TOKEN || (siteKey && siteKey === Deno.env.get("SITE_API_KEY")))) {
    return json({ error: "forbidden" }, 403);
  }

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  const results: any[] = [];

  try {
    try {
      await sql.begin(async (t) => {
        // utenti reali non-platform-admin da usare come owner/membri
        const users = await t`
          select u.id, u.email from auth.users u
          where not public.is_platform_admin(u.id)
          order by u.created_at limit 8`;
        if (users.length < 3) throw new Error("servono almeno 3 utenti non platform admin");

        const limitsRows = await t`select * from public.tier_limits order by tier`;
        results.push({ step: "tier_limits configurati", data: limitsRows });

        const tiers = ["basic", "advanced", "pro"] as const;
        for (const tier of tiers) {
          const [org] = await t`
            insert into public.organizations (name, slug)
            values (${"TEST " + tier}, ${"zz-test-" + tier + "-" + Date.now()})
            returning id`;
          await t`
            insert into public.organization_subscriptions (organization_id, tier, status, current_period_end)
            values (${org.id}, ${tier}::public.subscription_tier, 'active', now() + interval '30 days')`;

          const [lim] = await t`select * from public.get_tier_limits(${org.id})`;
          const maxProjects = lim.max_active_projects as number | null;

          // --- progetti attivi ---
          const cap = maxProjects ?? 3; // per il piano illimitato basta provare oltre i vecchi limiti
          let created = 0;
          let projectError: string | null = null;
          for (let i = 0; i < cap + 1; i++) {
            try {
              await t.savepoint(async (s: any) => {
                await s`
                  insert into public.projects
                    (owner_id, organization_id, code, name, client, start_date, target_completion_date)
                  values (${users[0].id}, ${org.id}, ${"P" + i}, ${"Proj " + i}, 'ACME',
                          current_date, current_date + 30)`;
              });
              created++;
            } catch (err) {
              projectError = (err as Error).message;
              break;
            }
          }

          // --- utenti per ruolo ---
          const perRole = lim.max_users_per_role as number | null;
          const roleCap = perRole ?? 3;
          let rolesCreated = 0;
          let roleError: string | null = null;
          for (let i = 0; i < Math.min(roleCap + 1, users.length); i++) {
            try {
              await t.savepoint(async (s: any) => {
                await s`insert into public.user_roles (user_id, organization_id, role)
                        values (${users[i].id}, ${org.id}, 'designer'::public.app_role)`;
              });
              rolesCreated++;
            } catch (err) {
              roleError = (err as Error).message;
              break;
            }
          }

          results.push({
            step: `piano ${tier}`,
            limiti_configurati: {
              progetti: maxProjects, storage_bytes: lim.max_storage_bytes,
              utenti_per_ruolo: perRole, addon: lim.max_addons,
              voci_boq: lim.max_boq_items_per_project,
            },
            progetti_creati_prima_del_blocco: created,
            errore_progetti: projectError,
            designer_creati_prima_del_blocco: rolesCreated,
            errore_ruoli: roleError,
          });
        }

        // --- 2. anagrafiche master cross-org ---
        const orgs = await t`
          select o.id, o.slug from public.organizations o
          where o.slug not like 'zz-test-%'
          order by o.created_at limit 5`;
        const adminOf = async (orgId: string) => {
          const [row] = await t`
            select ur.user_id, u.email from public.user_roles ur
            join auth.users u on u.id = ur.user_id
            where ur.organization_id = ${orgId} and ur.role = 'admin'
              and not public.is_platform_admin(ur.user_id)
            limit 1`;
          return row;
        };

        let pairFound = false;
        for (const a of orgs) {
          const admin = await adminOf(a.id);
          if (!admin) continue;
          const other = orgs.find((o: any) => o.id !== a.id);
          if (!other) continue;
          pairFound = true;

          for (const table of [
            "master_floors", "master_rooms", "master_item_types",
            "master_subcategories", "cost_categories",
          ]) {
            // lettura/scrittura come admin di a sull'org "other"
            let outcome = "?"; let detail: any = null;
            try {
              await t.savepoint(async (s: any) => {
                await s.unsafe(`set local role authenticated`);
                await s.unsafe(
                  `set local request.jwt.claims = '${JSON.stringify({ sub: admin.user_id, role: "authenticated", email: admin.email })}'`,
                );
                const r = await s.unsafe(
                  `update public.${table} set name = name || ' HACKED'
                   where organization_id = '${other.id}' returning id`,
                );
                if (r.length === 0) throw new Error("0 righe aggiornate (bloccato da RLS)");
                detail = r.length;
                outcome = "ALLOWED";
                throw new Error(ROLLBACK + "-sp");
              });
            } catch (err) {
              const m = (err as Error).message;
              if (m.includes(ROLLBACK)) { /* update era passato */ }
              else { outcome = "BLOCKED"; detail = m; }
            }
            await t.unsafe(`reset role`);
            results.push({
              step: `admin ${admin.email} (org ${a.slug}) scrive ${table} di ${other.slug}`,
              outcome, detail,
            });

            // controllo positivo: sulla PROPRIA org deve funzionare
            let own = "?"; let ownDetail: any = null;
            try {
              await t.savepoint(async (s: any) => {
                await s.unsafe(`set local role authenticated`);
                await s.unsafe(
                  `set local request.jwt.claims = '${JSON.stringify({ sub: admin.user_id, role: "authenticated", email: admin.email })}'`,
                );
                const r = await s.unsafe(
                  `update public.${table} set sort_order = sort_order
                   where organization_id = '${a.id}' returning id`,
                );
                ownDetail = r.length;
                own = r.length > 0 ? "ALLOWED" : "NO ROWS";
                throw new Error(ROLLBACK + "-sp");
              });
            } catch (err) {
              const m = (err as Error).message;
              if (!m.includes(ROLLBACK)) { own = "BLOCKED"; ownDetail = m; }
            }
            await t.unsafe(`reset role`);
            results.push({
              step: `admin ${admin.email} scrive ${table} della PROPRIA org ${a.slug}`,
              outcome: own, detail: ownDetail,
            });
          }
          break;
        }
        if (!pairFound) results.push({ step: "cross-org master data", outcome: "SKIPPED (nessun admin org non-platform trovato)" });

        throw new Error(ROLLBACK);
      });
    } catch (err) {
      if (!(err as Error).message.includes(ROLLBACK)) throw err;
    }

    const leftovers = await sql`select count(*)::int as n from public.organizations where slug like 'zz-test-%'`;
    return json({ ok: true, results, leftover_test_orgs: leftovers[0].n });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message, results }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
