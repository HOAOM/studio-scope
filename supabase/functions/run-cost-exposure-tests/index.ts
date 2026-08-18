/**
 * run-cost-exposure-tests — verifica che i campi costo/margine di
 * public.project_items (TABELLA DIRETTA, non la vista) non siano leggibili
 * dai membri org senza ruolo finanziario, e restino leggibili per i ruoli
 * abilitati (accountant/qs/admin/ceo/head_of_payments).
 * Richiede x-site-api-key.
 */
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-site-api-key",
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

  const body = await req.json().catch(() => ({}));
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const itemId: string = String(body.item_id ?? "");
  if (!UUID_RE.test(itemId)) return json({ error: "item_id must be a valid UUID" }, 400);

  const rawUsers: { label?: unknown; id?: unknown }[] = Array.isArray(body.users) ? body.users : [];
  const users: { label: string; id: string }[] = [];
  for (const u of rawUsers) {
    const id = String(u?.id ?? "");
    if (!UUID_RE.test(id)) return json({ error: "users[].id must be a valid UUID" }, 400);
    users.push({ id, label: String(u?.label ?? id).slice(0, 100) });
  }

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  const results: unknown[] = [];
  try {
    for (const u of users) {
      const claims = JSON.stringify({ sub: u.id, role: "authenticated" });
      for (const probe of [
        { name: "SELECT unit_cost,selling_price,margin_percentage (tabella diretta)",
          q: `select unit_cost, selling_price, margin_percentage from public.project_items where id = $1` },
        { name: "SELECT * (tabella diretta)",
          q: `select * from public.project_items where id = $1` },
        { name: "SELECT description (colonna non finanziaria)",
          q: `select description from public.project_items where id = $1` },
        { name: "SELECT dalla vista project_items_secure",
          q: `select unit_cost, selling_price, margin_percentage from public.project_items_secure where id = $1` },
      ]) {
        await sql.begin(async (tx) => {
          await tx.unsafe(`set local role authenticated`);
          await tx.unsafe(`select set_config('request.jwt.claims', $1, true)`, [claims]);
          try {
            const rows = await tx.unsafe(probe.q, [itemId]);
            results.push({ user: u.label, probe: probe.name, outcome: "ALLOWED", rows: rows.map((r: Record<string, unknown>) => ({
              unit_cost: r.unit_cost ?? null,
              selling_price: r.selling_price ?? null,
              margin_percentage: r.margin_percentage ?? null,
              description: r.description ?? undefined,
            })) });
          } catch (e) {
            results.push({ user: u.label, probe: probe.name, outcome: "BLOCKED", error: (e as Error).message });
          }
        }).catch((e) => {
          results.push({ user: u.label, probe: probe.name, outcome: "BLOCKED", error: (e as Error).message });
        });
      }
    }

    return json({ ok: true, item_id: itemId, results });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
