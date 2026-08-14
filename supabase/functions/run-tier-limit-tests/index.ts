/**
 * run-tier-limit-tests — esegue i test di enforcement dei limiti di piano
 * impersonando (a livello di ruolo Postgres) un utente `authenticated`
 * normale e un platform admin. Solo per verifica; protetto da x-site-api-key.
 */
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-site-api-key",
};

const ORG = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const USER = "ae20859a-290f-4d4d-91ee-5ad6b17a2e9c"; // membro normale dell'org di test
const PLATFORM = "471ce6a7-39dc-4497-a894-7b45903e7c40"; // platform owner

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.headers.get("x-site-api-key") !== Deno.env.get("SITE_API_KEY")) {
    return json({ error: "forbidden" }, 403);
  }

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  const results: any[] = [];

  const asUser = (uid: string) => `
    SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true);
  `;

  async function attempt(label: string, uid: string, stmt: string) {
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(asUser(uid));
        await tx.unsafe(stmt);
        throw new Error("__ROLLBACK__");
      });
      results.push({ test: label, outcome: "allowed" });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "__ROLLBACK__") results.push({ test: label, outcome: "allowed (rolled back)" });
      else results.push({ test: label, outcome: "blocked", message: msg });
    }
  }

  const extraMember = `INSERT INTO public.organization_members (organization_id, user_id, is_owner)
      VALUES ('${ORG}', 'e085cc53-6dfa-4a87-a648-5c4ef52a5f51', false)`;
  const extraProjectFor = (uid: string) => `INSERT INTO public.projects (owner_id, organization_id, code, name, client, start_date, target_completion_date)
      VALUES ('${uid}', '${ORG}', 'ZZ-TL-X', 'ZZ Extra', 'ZZ', current_date, current_date + 30)`;
  const extraItem = `INSERT INTO public.project_items (project_id, category, area, description)
      VALUES ('${PROJECT}', 'lighting', 'Test', 'ZZ extra item')`;
  const extraFile = `INSERT INTO storage.objects (bucket_id, name, owner, metadata)
      VALUES ('item-files', '${PROJECT}/zz-upload-${Date.now()}.bin', '${USER}', '{"size": 1024}'::jsonb)`;

  try {
    for (const [label, stmt] of [
      ["seat", extraMember], ["boq_item", extraItem], ["storage_upload", extraFile],
    ] as const) {
      await attempt(`${label} — utente normale`, USER, stmt);
      await attempt(`${label} — platform admin`, PLATFORM, stmt);
    }
    await attempt("project — utente normale", USER, extraProjectFor(USER));
    await attempt("project — platform admin", PLATFORM, extraProjectFor(PLATFORM));
    return json({ ok: true, results });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message, results }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
