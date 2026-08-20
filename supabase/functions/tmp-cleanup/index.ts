import { createClient } from "npm:@supabase/supabase-js@2";
import { findUserIdByEmail } from "../_shared/findUserByEmail.ts";

Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const orgs = [
    "79c70f07-efb8-4656-92a5-a6c753e3835b",
    "d571f8df-3c40-46d4-be93-59ed03a7e479",
  ];
  const emails = [
    "marcodenardi+linktest1@gmail.com",
    "marcodenardi+linktest2@gmail.com",
  ];

  const results: Record<string, unknown> = {};
  for (const org of orgs) {
    const { error } = await sb.from("organizations").delete().eq("id", org);
    results[org] = error?.message ?? "deleted";
  }

  for (const email of emails) {
    const uid = await findUserIdByEmail(sb, email);
    if (uid) {
      const { error } = await sb.auth.admin.deleteUser(uid);
      results[email] = error?.message ?? "deleted";
    } else {
      results[email] = "not_found";
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
});
