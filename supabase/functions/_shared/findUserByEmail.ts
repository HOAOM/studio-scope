/**
 * Lookup mirato di un utente per email tramite la RPC `find_user_id_by_email`
 * (indice funzionale su lower(email) di `profiles`), invece di scansionare
 * auth.admin.listUsers() che è paginato (default 50) e quindi lento
 * e soggetto a falsi negativi oltre la prima pagina.
 */
export async function findUserIdByEmail(
  admin: { rpc: (fn: string, args: Record<string, unknown>) => any },
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const { data } = await admin.rpc("find_user_id_by_email", { p_email: normalized });
  return (data as string | null) ?? null;
}
