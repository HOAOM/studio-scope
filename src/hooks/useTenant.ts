import { useEffect, useState } from "react";

const SITE_API = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/site-api`;

export type Tenant = {
  organization_id: string;
  slug: string;
  name: string;
};

/**
 * Risolve il tenant dall'hostname corrente (<slug>.kroneel.com o dominio custom).
 * Se l'host non corrisponde a nessuna organizzazione (es. preview Lovable o
 * localhost) restituisce tenant = null e l'app usa il comportamento standard
 * basato sulle membership dell'utente. La RLS resta invariata.
 */
export function useTenant() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const host = window.location.hostname;

    const isLocalOrPreview =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".lovable.app") ||
      host.endsWith(".lovableproject.com") ||
      host.endsWith(".lovable.dev");

    if (isLocalOrPreview) {
      setLoading(false);
      return;
    }


    fetch(`${SITE_API}/tenant?host=${encodeURIComponent(host)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.organization_id) setTenant(data as Tenant);
      })
      .catch(() => void 0)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { tenant, loading };
}
