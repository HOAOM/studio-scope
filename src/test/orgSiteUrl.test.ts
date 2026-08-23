import { describe, it, expect, beforeAll } from "vitest";
// Modulo Deno: usa `Deno.env` solo dentro le funzioni, quindi l'import e' sicuro
// in vitest a patto di stubbare il globale prima di eseguirle.
import { normalizeHost, requestSiteUrl, orgSiteUrl } from "../../supabase/functions/_shared/orgSiteUrl";

const env: Record<string, string> = {};

beforeAll(() => {
  (globalThis as any).Deno = { env: { get: (k: string) => env[k] } };
});

function fakeAdmin(org: { slug?: string; custom_domain?: string | null } | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: org }) }),
      }),
    }),
  };
}

const req = (origin?: string) =>
  new Request("https://x.test/fn", origin ? { headers: { origin } } : undefined);

describe("normalizeHost", () => {
  it("normalizza sempre a https://<host> scartando path e query", () => {
    expect(normalizeHost("https://enrico.amz.ee/admin?x=1")).toBe("https://enrico.amz.ee");
    expect(normalizeHost("enrico.amz.ee")).toBe("https://enrico.amz.ee");
    expect(normalizeHost("http://enrico.amz.ee")).toBe("https://enrico.amz.ee");
  });

  it("conserva protocollo e porta solo in locale", () => {
    expect(normalizeHost("http://localhost:8080/foo")).toBe("http://localhost:8080");
  });

  it("ritorna null su valori vuoti o non parsabili", () => {
    expect(normalizeHost(null)).toBeNull();
    expect(normalizeHost("")).toBeNull();
    expect(normalizeHost("   ")).toBeNull();
  });
});

describe("orgSiteUrl — precedenza degli host", () => {
  it("1. custom_domain dell'organizzazione vince su tutto", async () => {
    env.TENANT_SUBDOMAIN_BASE = "kroneel.com";
    const url = await orgSiteUrl(fakeAdmin({ slug: "enrico", custom_domain: "enrico.amz.ee" }), "org-1", req("https://studio-scope.lovable.app"));
    expect(url).toBe("https://enrico.amz.ee");
  });

  it("2. <slug>.<base> solo se TENANT_SUBDOMAIN_BASE e' impostata", async () => {
    env.TENANT_SUBDOMAIN_BASE = "kroneel.com";
    expect(await orgSiteUrl(fakeAdmin({ slug: "enrico", custom_domain: null }), "org-1", req("https://studio-scope.lovable.app")))
      .toBe("https://enrico.kroneel.com");

    // senza la variabile non si costruiscono link verso DNS inesistenti
    delete env.TENANT_SUBDOMAIN_BASE;
    expect(await orgSiteUrl(fakeAdmin({ slug: "enrico", custom_domain: null }), "org-1", req("https://studio-scope.lovable.app")))
      .toBe("https://studio-scope.lovable.app");
  });

  it("3. fallback all'origin della richiesta, normalizzato", async () => {
    delete env.TENANT_SUBDOMAIN_BASE;
    expect(await orgSiteUrl(fakeAdmin(null), null, req("https://igor.amz.ee/super-admin")))
      .toBe("https://igor.amz.ee");
  });

  it("4. ultimo fallback: SITE_URL, poi il default di piattaforma", async () => {
    env.SITE_URL = "https://kroneel.com";
    expect(requestSiteUrl(req())).toBe("https://kroneel.com");
    delete env.SITE_URL;
    expect(requestSiteUrl(req())).toBe("https://studio-scope.lovable.app");
  });
});
