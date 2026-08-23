/**
 * orgSiteUrl — deriva l'host su cui devono atterrare i link (invito, reset
 * password, magic link) di una specifica organizzazione.
 *
 * Ordine di precedenza:
 *   1. organizations.custom_domain            (es. enrico.amz.ee)
 *   2. <slug>.<TENANT_SUBDOMAIN_BASE>         (solo se la variabile e' impostata:
 *                                              il wildcard DNS deve esistere,
 *                                              altrimenti il link e' morto)
 *   3. origin / referer della richiesta
 *   4. SITE_URL / default di piattaforma
 *
 * Il risultato e' SEMPRE normalizzato a `https://<host>` — path, query e
 * fragment dell'origin vengono scartati, cosi' non si costruiscono mai URL
 * tipo `https://x.com/admin/accept-invite`.
 */

const DEFAULT_SITE = "https://studio-scope.lovable.app";

/** Accesso all'env compatibile sia con Deno sia con i test in Node/vitest. */
function envGet(key: string): string | undefined {
  return (globalThis as any).Deno?.env?.get(key);
}

/** Estrae `https://<host>` da una stringa URL, o null se non parsabile. */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    if (!u.hostname) return null;
    const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    const proto = isLocal ? u.protocol.replace(":", "") : "https";
    const port = isLocal && u.port ? `:${u.port}` : "";
    return `${proto}://${u.hostname}${port}`;
  } catch {
    return null;
  }
}

export function requestSiteUrl(req: Request): string {
  return (
    normalizeHost(req.headers.get("origin")) ??
    normalizeHost(req.headers.get("referer")) ??
    normalizeHost(envGet("SITE_URL")) ??
    DEFAULT_SITE
  );
}

type MinimalClient = {
  from: (t: string) => any;
};

/**
 * Host dell'organizzazione. `req` serve solo come fallback finale.
 */
export async function orgSiteUrl(
  admin: MinimalClient,
  organizationId: string | null | undefined,
  req: Request,
): Promise<string> {
  if (organizationId) {
    const { data: org } = await admin
      .from("organizations")
      .select("slug, custom_domain")
      .eq("id", organizationId)
      .maybeSingle();

    const fromCustom = normalizeHost(org?.custom_domain);
    if (fromCustom) return fromCustom;

    // Fallback su sottodominio di piattaforma solo se il wildcard e' attivo.
    const base = (envGet("TENANT_SUBDOMAIN_BASE") ?? "").trim();
    if (base && org?.slug) {
      const fromSlug = normalizeHost(`${org.slug}.${base}`);
      if (fromSlug) return fromSlug;
    }
  }

  return requestSiteUrl(req);
}
