import { createClient } from "npm:@supabase/supabase-js@2";
Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const org = "479baf88-1622-4cd6-8dfb-29b99d253a47";
  const { error } = await sb.from("organizations").delete().eq("id", org);
  const { data: users } = await sb.auth.admin.listUsers();
  const u = users?.users?.find((x) => x.email?.toLowerCase() === "marcodenardi+dupcheck818@gmail.com");
  if (u) await sb.auth.admin.deleteUser(u.id);
  return new Response(JSON.stringify({ error: error?.message ?? null, user_deleted: !!u }));
});
