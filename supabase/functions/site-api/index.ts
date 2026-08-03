// Site API - Phase 6
// Public-facing API for the external sales website to provision orgs,
// validate discount/referral codes, update subscription state, and bind custom domains.
// Auth: shared secret header `x-site-api-key` matching SITE_API_KEY env var.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-site-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE_API_KEY = (Deno.env.get("SITE_API_KEY") ?? "").trim().replace(/^["']|["']$/g, "");

const admin = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function sha256(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}


function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || `org-${Math.random().toString(36).slice(2, 8)}`;
}

async function uniqueSlug(sb: ReturnType<typeof admin>, base: string) {
  let slug = slugify(base);
  let n = 0;
  while (true) {
    const { data } = await sb
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
    n += 1;
    slug = `${slugify(base)}-${n}`;
  }
}

// ─── ROUTES ───────────────────────────────────────────────────────────────

// POST /organizations
// body: { name, owner_email, owner_display_name?, tier?, custom_domain?, referral_code?, discount_code? }
async function createOrganization(body: any) {
  if (!body?.name || !body?.owner_email) {
    return json({ error: "name and owner_email are required" }, 400);
  }
  const tier = body.tier ?? "starter";
  if (!["starter", "pro", "business"].includes(tier)) {
    return json({ error: "invalid tier" }, 400);
  }

  const sb = admin();

  // 1) ensure user exists (invite or fetch)
  let userId: string | null = null;
  const { data: existing } = await sb.auth.admin.listUsers();
  const match = existing?.users?.find(
    (u) => u.email?.toLowerCase() === body.owner_email.toLowerCase(),
  );
  if (match) {
    userId = match.id;
  } else {
    const { data: invited, error: inviteErr } =
      await sb.auth.admin.inviteUserByEmail(body.owner_email, {
        data: { display_name: body.owner_display_name ?? null },
      });
    if (inviteErr || !invited?.user) {
      return json(
        { error: "could not create owner user", detail: inviteErr?.message },
        500,
      );
    }
    userId = invited.user.id;
  }

  // 2) create org
  const slug = await uniqueSlug(sb, body.name);
  const { data: org, error: orgErr } = await sb
    .from("organizations")
    .insert({
      name: body.name,
      slug,
      custom_domain: body.custom_domain ?? null,
    })
    .select()
    .single();
  if (orgErr) return json({ error: "org create failed", detail: orgErr.message }, 500);

  // 3) link owner as member
  const { error: memErr } = await sb.from("organization_members").insert({
    organization_id: org.id,
    user_id: userId,
    is_owner: true,
  });
  if (memErr) return json({ error: "member link failed", detail: memErr.message }, 500);

  // 4) subscription row (active, 30d default period; site/Stripe will sync later)
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 30);
  const { error: subErr } = await sb.from("organization_subscriptions").insert({
    organization_id: org.id,
    tier,
    status: "active",
    current_period_end: periodEnd.toISOString(),
  });
  if (subErr) return json({ error: "subscription create failed", detail: subErr.message }, 500);

  // 5) codice unico: prima come sconto, poi come referral; se non esiste, ignorato
  const rawCode = String(body.discount_code ?? body.referral_code ?? body.code ?? "").trim();
  let codeApplied: Record<string, unknown> | null = null;
  let referralApplied = false;
  let discountApplied = false;

  if (rawCode) {
    const code = rawCode.toUpperCase();
    const { data: disc } = await sb
      .from("discount_codes")
      .select("code, percent_off, amount_off")
      .eq("code", code)
      .maybeSingle();

    if (disc) {
      const { data: discOk } = await sb.rpc("redeem_discount", { p_code: code, p_org: org.id });
      discountApplied = !!discOk;
      if (discountApplied) {
        codeApplied = {
          type: "discount",
          code,
          percent: disc.percent_off !== null ? Number(disc.percent_off) : null,
          amount: disc.amount_off !== null ? Number(disc.amount_off) : null,
        };
      }
    } else {
      const { data: ref } = await sb
        .from("referral_codes")
        .select("code")
        .eq("code", code)
        .maybeSingle();
      if (ref) {
        const { data: refOk } = await sb.rpc("apply_referral", { p_code: code, p_org: org.id });
        referralApplied = !!refOk;
        if (referralApplied) codeApplied = { type: "referral", code };
      }
    }
  }

  return json({
    ok: true,
    organization_id: org.id,
    slug: org.slug,
    owner_user_id: userId,
    tier,
    code_applied: codeApplied,
    referral_applied: referralApplied,
    discount_applied: discountApplied,
  }, 201);
}

// ─── TENANT RESOLUTION (pubblico, read-only) ──────────────────────────────

const ROOT_DOMAIN = "kroneel.com";

function normalizeHost(raw: string) {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
}

// GET /tenant?host=<hostname>
async function resolveTenant(url: URL) {
  const raw = url.searchParams.get("host");
  if (!raw) return json({ error: "host required" }, 400);
  const host = normalizeHost(raw);
  const sb = admin();

  // 1) dominio custom attivo (tabella organization_domains)
  const { data: dom } = await sb
    .from("organization_domains")
    .select("organization_id")
    .eq("domain", host)
    .eq("status", "active")
    .maybeSingle();
  if (dom) {
    const { data: org } = await sb
      .from("organizations")
      .select("id, slug, name")
      .eq("id", dom.organization_id)
      .maybeSingle();
    if (org) return json({ organization_id: org.id, slug: org.slug, name: org.name });
  }

  // 2) legacy: organizations.custom_domain
  const { data: legacy } = await sb
    .from("organizations")
    .select("id, slug, name")
    .eq("custom_domain", host)
    .maybeSingle();
  if (legacy) return json({ organization_id: legacy.id, slug: legacy.slug, name: legacy.name });

  // 3) sottodominio <slug>.kroneel.com
  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    const slug = host.slice(0, -1 * (ROOT_DOMAIN.length + 1));
    if (slug && slug !== "www") {
      const { data: bySlug } = await sb
        .from("organizations")
        .select("id, slug, name")
        .eq("slug", slug)
        .maybeSingle();
      if (bySlug) return json({ organization_id: bySlug.id, slug: bySlug.slug, name: bySlug.name });
    }
  }

  return json({ error: "tenant not found", host }, 404);
}

// ─── CUSTOM DOMAINS ───────────────────────────────────────────────────────

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/;

async function authedUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const { data } = await admin().auth.getUser(authHeader.slice(7));
  return data?.user ?? null;
}

// POST /domains  body: { organization_id, domain }  (Bearer user token, owner-only)
async function createDomain(req: Request, body: any) {
  const user = await authedUser(req);
  if (!user) return json({ error: "unauthenticated" }, 401);
  const orgId = body?.organization_id;
  const domain = normalizeHost(String(body?.domain ?? ""));
  if (!orgId || !domain) return json({ error: "organization_id and domain required" }, 400);
  if (!DOMAIN_RE.test(domain)) return json({ error: "invalid domain format" }, 400);
  if (domain === ROOT_DOMAIN || domain.endsWith(`.${ROOT_DOMAIN}`))
    return json({ error: "kroneel.com subdomains are assigned automatically" }, 400);

  const sb = admin();
  const { data: owner } = await sb
    .from("organization_members")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .eq("is_owner", true)
    .maybeSingle();
  if (!owner) return json({ error: "forbidden: owner only" }, 403);

  const { data: taken } = await sb
    .from("organization_domains")
    .select("organization_id")
    .eq("domain", domain)
    .maybeSingle();
  if (taken && taken.organization_id !== orgId)
    return json({ error: "domain already in use" }, 409);

  const token = `kroneel-verify=${crypto.randomUUID().replace(/-/g, "")}`;
  let row = taken
    ? (await sb.from("organization_domains").select("*").eq("domain", domain).single()).data
    : null;

  if (!row) {
    const { data: inserted, error } = await sb
      .from("organization_domains")
      .insert({
        organization_id: orgId,
        domain,
        status: "pending",
        verification_token: token,
      })
      .select()
      .single();
    if (error) return json({ error: "domain create failed", detail: error.message }, 500);
    row = inserted;
  }

  return json({
    domain: row,
    dns_instructions: [
      { type: "TXT", name: `_kroneel.${domain}`, value: row.verification_token,
        purpose: "verifica di proprietà" },
      { type: "CNAME", name: domain, value: `${domain.split(".").length > 2 ? "" : "@ → "}app.${ROOT_DOMAIN}`,
        purpose: "puntamento all'app (usa A record se il tuo DNS non supporta CNAME su root)" },
    ],
  }, 201);
}

// GET /domains?organization_id=...   (Bearer user token, membro)
async function listDomains(req: Request, url: URL) {
  const user = await authedUser(req);
  if (!user) return json({ error: "unauthenticated" }, 401);
  const orgId = url.searchParams.get("organization_id");
  if (!orgId) return json({ error: "organization_id required" }, 400);

  const sb = admin();
  const { data: member } = await sb
    .from("organization_members")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return json({ error: "forbidden" }, 403);

  const { data, error } = await sb
    .from("organization_domains")
    .select("id, domain, status, verification_token, last_error, last_checked_at, verified_at, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });
  if (error) return json({ error: error.message }, 500);
  return json({ domains: data ?? [] });
}

// TXT lookup via DNS-over-HTTPS (Cloudflare)
async function lookupTxt(name: string): Promise<string[]> {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`, {
    headers: { accept: "application/dns-json" },
  });
  if (!res.ok) return [];
  const dns = await res.json();
  return (dns.Answer ?? []).map((a: any) => String(a.data ?? "").replace(/^"|"$/g, ""));
}

// POST /domains/verify   (x-site-api-key — chiamato dal cron)
async function verifyDomains() {
  const sb = admin();
  const { data: rows } = await sb
    .from("organization_domains")
    .select("id, domain, verification_token, status")
    .in("status", ["pending", "verifying", "failed"])
    .limit(50);

  const results: unknown[] = [];
  for (const row of rows ?? []) {
    let status = "verifying";
    let lastError: string | null = null;
    try {
      const txt = await lookupTxt(`_kroneel.${row.domain}`);
      if (txt.some((t) => t === row.verification_token)) {
        status = "active";
      } else {
        lastError = "record TXT _kroneel non trovato o non corrispondente";
        status = row.status === "pending" ? "verifying" : "failed";
      }
    } catch (e) {
      lastError = String(e);
      status = "failed";
    }
    await sb
      .from("organization_domains")
      .update({
        status,
        last_error: lastError,
        last_checked_at: new Date().toISOString(),
        verified_at: status === "active" ? new Date().toISOString() : null,
      })
      .eq("id", row.id);

    if (status === "active") {
      await sb.from("organizations")
        .update({ custom_domain: row.domain })
        .eq("id", (await sb.from("organization_domains").select("organization_id").eq("id", row.id).single()).data!.organization_id);
    }
    results.push({ domain: row.domain, status, last_error: lastError });
  }
  return json({ checked: results.length, results });
}

async function activeDomainFor(sb: ReturnType<typeof admin>, orgId: string) {
  const { data } = await sb
    .from("organization_domains")
    .select("domain")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return data?.domain ?? null;
}

// ─── SSO handoff ──────────────────────────────────────────────────────────


// POST /sso/ticket  — Authorization: Bearer <user access_token>
// body: { organization_id }
async function ssoTicket(req: Request, body: any) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthenticated" }, 401);
  const token = authHeader.slice(7);

  const sb = admin();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user) return json({ error: "unauthenticated" }, 401);
  const user = userRes.user;

  let orgId: string | null = body?.organization_id ?? null;
  if (!orgId) {
    const { data: firstMem } = await sb
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    orgId = firstMem?.organization_id ?? null;
  }
  if (!orgId) return json({ error: "organization_id required" }, 400);

  const { data: member } = await sb
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!member) return json({ error: "forbidden: not a member of this organization" }, 403);

  const { data: org } = await sb
    .from("organizations")
    .select("slug, custom_domain")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return json({ error: "organization not found" }, 404);

  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  const ticket = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const tokenHash = await sha256(ticket);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();

  const { error: insErr } = await sb.from("sso_tickets").insert({
    token_hash: tokenHash,
    user_id: user.id,
    organization_id: orgId,
    expires_at: expiresAt,
  });
  if (insErr) return json({ error: "ticket create failed", detail: insErr.message }, 500);

  const host = org.custom_domain ?? `${org.slug}.kroneel.com`;
  return json({
    url: `https://${host}/sso?ticket=${ticket}`,
    ticket,
    expires_at: expiresAt,
    organization_id: orgId,
  });
}

// POST /sso/redeem  body: { ticket }
async function ssoRedeem(req: Request, body: any) {
  const sb = admin();
  const ticket = String(body?.ticket ?? "").trim();
  const logFail = async (reason: string, tokenHash: string | null) => {
    await sb.from("sso_redeem_failures").insert({
      reason,
      token_hash: tokenHash,
      ip: req.headers.get("x-forwarded-for"),
      user_agent: req.headers.get("user-agent"),
    });
  };

  if (!ticket) {
    await logFail("missing_ticket", null);
    return json({ error: "invalid ticket" }, 401);
  }
  const tokenHash = await sha256(ticket);

  // consumo atomico: passa solo se non usato e non scaduto
  const { data: rows, error: updErr } = await sb
    .from("sso_tickets")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id, organization_id");

  if (updErr || !rows || rows.length === 0) {
    await logFail(updErr ? `db_error:${updErr.message}` : "expired_used_or_unknown", tokenHash);
    return json({ error: "invalid or expired ticket" }, 401);
  }
  const row = rows[0];

  const { data: userRes } = await sb.auth.admin.getUserById(row.user_id);
  const email = userRes?.user?.email;
  if (!email) {
    await logFail("user_without_email", tokenHash);
    return json({ error: "invalid ticket" }, 401);
  }

  const { data: link, error: linkErr } = await sb.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    await logFail(`link_failed:${linkErr?.message ?? "no_token"}`, tokenHash);
    return json({ error: "session issue failed" }, 500);
  }

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (verifyErr || !verified?.session) {
    await logFail(`verify_failed:${verifyErr?.message ?? "no_session"}`, tokenHash);
    return json({ error: "session issue failed" }, 500);
  }

  return json({
    ok: true,
    organization_id: row.organization_id,
    user_id: row.user_id,
    session: {
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
      expires_in: verified.session.expires_in,
      expires_at: verified.session.expires_at,
      token_type: verified.session.token_type,
    },
  });
}


// POST /subscription/sync
// body: { organization_id, tier?, status?, current_period_end?, stripe_customer_id? }
async function syncSubscription(body: any) {
  if (!body?.organization_id) return json({ error: "organization_id required" }, 400);
  const patch: Record<string, unknown> = {};
  for (const k of ["tier", "status", "current_period_end", "stripe_customer_id"]) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (Object.keys(patch).length === 0) return json({ error: "no fields to update" }, 400);

  const sb = admin();
  const { data, error } = await sb
    .from("organization_subscriptions")
    .update(patch)
    .eq("organization_id", body.organization_id)
    .select()
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ subscription: data });
}

// POST /discount/validate  body: { code, organization_id }
async function validateDiscount(body: any) {
  if (!body?.code || !body?.organization_id)
    return json({ error: "code and organization_id required" }, 400);
  const sb = admin();
  const { data: sub } = await sb
    .from("organization_subscriptions")
    .select("tier")
    .eq("organization_id", body.organization_id)
    .maybeSingle();
  if (!sub) return json({ error: "organization has no subscription" }, 404);
  const { data, error } = await sb.rpc("validate_discount", {
    p_code: body.code,
    p_org: body.organization_id,
    p_tier: sub.tier,
  });
  if (error) return json({ error: error.message }, 500);
  return json({ result: Array.isArray(data) ? data[0] : data });
}

// POST /discount/redeem  body: { code, organization_id }
async function redeemDiscount(body: any) {
  if (!body?.code || !body?.organization_id)
    return json({ error: "code and organization_id required" }, 400);
  const sb = admin();
  const { data, error } = await sb.rpc("redeem_discount", {
    p_code: body.code,
    p_org: body.organization_id,
  });
  if (error) return json({ error: error.message }, 500);
  return json({ redeemed: !!data });
}

// POST /referral/apply  body: { code, organization_id }
async function applyReferral(body: any) {
  if (!body?.code || !body?.organization_id)
    return json({ error: "code and organization_id required" }, 400);
  const sb = admin();
  const { data, error } = await sb.rpc("apply_referral", {
    p_code: body.code,
    p_org: body.organization_id,
  });
  if (error) return json({ error: error.message }, 500);
  return json({ applied: !!data });
}

// POST /custom-domain  body: { organization_id, custom_domain }
async function setCustomDomain(body: any) {
  if (!body?.organization_id || !body?.custom_domain)
    return json({ error: "organization_id and custom_domain required" }, 400);
  const domain = String(body.custom_domain).trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain))
    return json({ error: "invalid domain format" }, 400);
  const sb = admin();
  const { data, error } = await sb
    .from("organizations")
    .update({ custom_domain: domain })
    .eq("id", body.organization_id)
    .select()
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ organization: data });
}

// GET /org/lookup?slug= | ?domain= | ?id=
async function lookupOrg(url: URL) {
  const sb = admin();
  let q = sb.from("organizations").select("id, name, slug, custom_domain");
  const slug = url.searchParams.get("slug");
  const domain = url.searchParams.get("domain");
  const id = url.searchParams.get("id");
  if (slug) q = q.eq("slug", slug);
  else if (domain) q = q.eq("custom_domain", domain.toLowerCase());
  else if (id) q = q.eq("id", id);
  else return json({ error: "slug, domain, or id required" }, 400);
  const { data, error } = await q.maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "not found" }, 404);
  return json({ organization: data });
}

// ─── DISPATCH ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  // strip "/site-api" prefix from path
  const path = url.pathname.replace(/^\/site-api/, "") || "/";

  // Le rotte SSO usano il token utente (ticket) invece della shared secret.
  const isSsoRoute = path === "/sso/ticket" || path === "/sso/redeem";
  if (!isSsoRoute) {
    const key = req.headers.get("x-site-api-key");
    if (!SITE_API_KEY || key !== SITE_API_KEY) {
      return json({ error: "unauthorized" }, 401);
    }
  }

  try {
    if (req.method === "GET" && path === "/health") {
      return json({ ok: true, ts: new Date().toISOString() });
    }
    if (req.method === "GET" && path === "/org/lookup") {
      return await lookupOrg(url);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      switch (path) {
        case "/organizations":      return await createOrganization(body);
        case "/subscription/sync":  return await syncSubscription(body);
        case "/discount/validate":  return await validateDiscount(body);
        case "/discount/redeem":    return await redeemDiscount(body);
        case "/referral/apply":     return await applyReferral(body);
        case "/custom-domain":      return await setCustomDomain(body);
        case "/sso/ticket":         return await ssoTicket(req, body);
        case "/sso/redeem":         return await ssoRedeem(req, body);
      }
    }


    return json({ error: "not found", path, method: req.method }, 404);
  } catch (e) {
    return json({ error: "internal error", detail: String(e) }, 500);
  }
});
