/**
 * Lookup mirato di un utente per email tramite la tabella `profiles`
 * (indice funzionale su lower(email)), invece di scansionare
 * auth.admin.listUsers() che è paginato (default 50) e quindi lento
 * e soggetto a falsi negativi oltre la prima pagina.
 */
export async function findUserIdByEmail(
  admin: { from: (t: string) => any },
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const { data } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", normalized)
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
