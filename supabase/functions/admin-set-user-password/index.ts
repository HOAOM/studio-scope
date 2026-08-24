/**
 * admin-set-user-password — impostazione diretta della password di un utente
 * riservata al livello PIATTAFORMA (public.platform_admins).
 *
 * Non tocca in alcun modo la sessione del browser del chiamante né il flusso
 * /reset-password: opera esclusivamente via service_role su un user_id target.
 *
 * Azioni:
 *  - list_members  { organization_id } -> membri dell'organizzazione
 *  - set_password  { user_id, new_password }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { orgSiteUrl } from '../_shared/orgSiteUrl.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const APP_ROLES = [
  'admin', 'designer', 'accountant', 'qs', 'head_of_payments', 'client', 'ceo',
  'site_engineer', 'project_manager', 'procurement_manager', 'mep_engineer',
  'coo', 'head_of_design', 'architectural_dept',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── Auth + autorizzazione in UNA sola chiamata ──
    // La RPC viene eseguita col JWT del chiamante: PostgREST ne verifica la
    // firma (401 se invalido) e is_platform_admin() usa auth.uid().
    // Nessun round-trip extra su /auth/v1/user.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No authorization header' }, 401)
    const token = authHeader.replace('Bearer ', '')

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: isPlatformAdmin, error: authzError } = await caller.rpc('is_platform_admin')
    if (authzError) return json({ error: 'Not authenticated' }, 401)
    if (isPlatformAdmin !== true) return json({ error: 'Platform admin access required' }, 403)

    // Identita' del chiamante letta dal JWT gia' verificato lato PostgREST
    // (usata solo per audit log / attribuzione, non per autorizzare).
    let user: { id: string; email?: string | null }
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (!UUID_RE.test(String(payload?.sub ?? ''))) throw new Error('bad sub')
      user = { id: payload.sub, email: payload.email ?? null }
    } catch {
      return json({ error: 'Not authenticated' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const action = String(body?.action ?? 'set_password')

    if (action === 'list_members') {
      const orgId = String(body?.organization_id ?? '')
      if (!UUID_RE.test(orgId)) return json({ error: 'organization_id non valido' }, 400)

      // Membri, inviti, ruoli e limiti di tier in parallelo
      const [membersRes, invitesRes, rolesRes, limitsRes] = await Promise.all([
        admin
          .from('organization_members')
          .select('user_id, is_owner, joined_at, is_complimentary, complimentary_reason, is_over_tier_limit')
          .eq('organization_id', orgId),
        admin
          .from('organization_invites')
          .select('id, email, base_role, status, is_complimentary, complimentary_reason, is_over_tier_limit, expires_at')
          .eq('organization_id', orgId)
          .eq('status', 'pending'),
        admin
          .from('user_roles')
          .select('user_id, role')
          .eq('organization_id', orgId),
        admin.rpc('get_tier_limits', { p_org: orgId }),
      ])
      if (membersRes.error) return json({ error: membersRes.error.message }, 400)
      const members = membersRes.data
      const invites = invitesRes.data

      const ids = (members ?? []).map((m: { user_id: string }) => m.user_id)
      const profiles: Record<string, { email: string | null; display_name: string | null }> = {}
      const rolesByUser: Record<string, string[]> = {}
      for (const r of rolesRes.data ?? []) {
        ;(rolesByUser[r.user_id] ??= []).push(r.role)
      }
      if (ids.length) {
        const { data: profs } = await admin
          .from('profiles')
          .select('id, email, display_name')
          .in('id', ids)
        for (const p of profs ?? []) {
          profiles[p.id] = { email: p.email, display_name: p.display_name }
        }
      }

      // Conteggio utenti per ruolo con la stessa semantica di
      // org_role_user_count: esclude omaggi e utenti fuori tier.
      const excluded = new Set(
        (members ?? [])
          .filter((m: any) => m.is_complimentary === true || m.is_over_tier_limit === true)
          .map((m: any) => m.user_id),
      )
      const roleCounts: Record<string, number> = {}
      const seen = new Set<string>()
      for (const r of rolesRes.data ?? []) {
        if (excluded.has(r.user_id)) continue
        const key = `${r.role}:${r.user_id}`
        if (seen.has(key)) continue
        seen.add(key)
        roleCounts[r.role] = (roleCounts[r.role] ?? 0) + 1
      }
      const limitRow: any = Array.isArray(limitsRes.data) ? limitsRes.data[0] : limitsRes.data

      return json({
        members: (members ?? []).map((m: any) => ({
          user_id: m.user_id,
          is_owner: m.is_owner,
          joined_at: m.joined_at,
          is_complimentary: m.is_complimentary === true,
          complimentary_reason: m.complimentary_reason ?? null,
          is_over_tier_limit: m.is_over_tier_limit === true,
          roles: rolesByUser[m.user_id] ?? [],
          email: profiles[m.user_id]?.email ?? null,
          display_name: profiles[m.user_id]?.display_name ?? null,
        })),
        invites: invites ?? [],
        role_counts: roleCounts,
        max_users_per_role: limitRow?.max_users_per_role ?? null,
        tier: limitRow?.tier ?? null,
      })
    }

    // Quota disponibile per un ruolo in una organizzazione
    const roleQuota = async (orgId: string, role: string) => {
      const { data: limits } = await admin.rpc('get_tier_limits', { p_org: orgId })
      const limitRow: any = Array.isArray(limits) ? limits[0] : limits
      const max = limitRow?.max_users_per_role ?? null
      const { data: used } = await admin.rpc('org_role_user_count', {
        p_org: orgId, p_role: role,
      })
      const usedCount = typeof used === 'number' ? used : 0
      return {
        used: usedCount,
        max,
        tier: limitRow?.tier ?? null,
        full: max !== null && usedCount >= max,
      }
    }

    if (action === 'role_quota') {
      const orgId = String(body?.organization_id ?? '')
      const role = String(body?.role ?? '')
      if (!UUID_RE.test(orgId)) return json({ error: 'organization_id non valido' }, 400)
      if (!APP_ROLES.includes(role)) return json({ error: 'Ruolo non valido' }, 400)
      return json(await roleQuota(orgId, role))
    }

    if (action === 'invite_extra_user') {
      const orgId = String(body?.organization_id ?? '')
      const email = String(body?.email ?? '').trim().toLowerCase()
      const role = String(body?.role ?? '')
      const isComplimentary = body?.is_complimentary === true
      const reason = String(body?.reason ?? '').slice(0, 500)

      if (!UUID_RE.test(orgId)) return json({ error: 'organization_id non valido' }, 400)
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 255) {
        return json({ error: 'Email non valida' }, 400)
      }
      if (!APP_ROLES.includes(role)) return json({ error: 'Ruolo non valido' }, 400)
      if (isComplimentary && reason.length < 3) {
        return json({ error: 'Indica il motivo dell\u2019eccezione fuori tier' }, 400)
      }

      const { data: org } = await admin
        .from('organizations').select('name').eq('id', orgId).maybeSingle()
      if (!org) return json({ error: 'Organizzazione non trovata' }, 404)

      // Quota del tier per quel ruolo: se piena l'utente viene creato in eccedenza
      const quota = await roleQuota(orgId, role)
      // "omaggio" resta una scelta esplicita del super-admin; l'eccedenza e' automatica
      const overTier = !isComplimentary && quota.full

      // Utente gia' esistente?
      const { data: existingProfile } = await admin
        .from('profiles').select('id, email').ilike('email', email).maybeSingle()

      let targetUserId: string | null = existingProfile?.id ?? null
      let emailSent = false
      let acceptUrl: string | null = null

      if (targetUserId) {
        // Aggiunta diretta come membro dell'organizzazione
        const { error: memErr } = await admin.from('organization_members').upsert({
          organization_id: orgId,
          user_id: targetUserId,
          is_owner: false,
          is_complimentary: isComplimentary,
          complimentary_reason: isComplimentary ? reason : null,
          complimentary_by: isComplimentary ? user.id : null,
          complimentary_at: isComplimentary ? new Date().toISOString() : null,
          is_over_tier_limit: overTier,
          over_tier_by: overTier ? user.id : null,
          over_tier_at: overTier ? new Date().toISOString() : null,
        }, { onConflict: 'organization_id,user_id' })
        if (memErr) return json({ error: memErr.message }, 400)

        const { error: roleErr } = await admin.from('user_roles').upsert({
          user_id: targetUserId, role, organization_id: orgId,
        }, { onConflict: 'user_id,role,organization_id' })
        if (roleErr) return json({ error: roleErr.message }, 400)
      } else {
        // Invito: passa dall'helper condiviso (host dell'org, gate password,
        // riuso invito pendente, email anche al secondo invito).
        const res = await sendOrgInvite(admin, {
          organizationId: orgId,
          email,
          baseRole: role,
          isOwner: false,
          invitedBy: user.id,
          isComplimentary,
          complimentaryReason: isComplimentary ? reason : null,
          isOverTierLimit: overTier,
          req,
        })
        if (res.error) return json({ error: res.error }, 400)
        acceptUrl = res.accept_url
        emailSent = res.email_sent
      }


      const quotaText = `Quota ruolo ${role}: ${quota.used}/${quota.max ?? 'illimitato'}`
      await admin.from('audit_log').insert({
        entity_type: 'organization',
        entity_id: orgId,
        action: isComplimentary
          ? 'platform_admin_complimentary_user'
          : overTier
            ? 'platform_admin_add_user_over_tier'
            : 'platform_admin_add_user',
        user_id: user.id,
        summary: isComplimentary
          ? `Utente omaggio FUORI TIER ${email} (ruolo ${role}) aggiunto a ${org.name} dal platform admin ${user.email ?? user.id}. Motivo: ${reason}. ${quotaText}`
          : overTier
            ? `Utente ${email} (ruolo ${role}) creato IN ECCEDENZA rispetto al limite di piano su ${org.name} dal platform admin ${user.email ?? user.id}. ${quotaText}`
            : `Utente ${email} (ruolo ${role}) aggiunto a ${org.name} dal platform admin ${user.email ?? user.id}, posto consumato dalla quota. ${quotaText}`,
      })

      return json({
        success: true,
        email_sent: emailSent,
        accept_url: acceptUrl,
        existing_user: !!targetUserId,
        over_tier_limit: overTier,
        quota,
      })
    }


    if (action === 'set_complimentary') {
      const orgId = String(body?.organization_id ?? '')
      const targetId = String(body?.user_id ?? '')
      const isComplimentary = body?.is_complimentary === true
      const reason = String(body?.reason ?? '').slice(0, 500)
      if (!UUID_RE.test(orgId) || !UUID_RE.test(targetId)) return json({ error: 'Parametri non validi' }, 400)
      if (isComplimentary && reason.length < 3) {
        return json({ error: 'Indica il motivo dell\u2019eccezione fuori tier' }, 400)
      }

      const { error: upErr } = await admin
        .from('organization_members')
        .update({
          is_complimentary: isComplimentary,
          complimentary_reason: isComplimentary ? reason : null,
          complimentary_by: isComplimentary ? user.id : null,
          complimentary_at: isComplimentary ? new Date().toISOString() : null,
        })
        .eq('organization_id', orgId)
        .eq('user_id', targetId)
      if (upErr) return json({ error: upErr.message }, 400)

      await admin.from('audit_log').insert({
        entity_type: 'organization',
        entity_id: orgId,
        action: isComplimentary ? 'platform_admin_complimentary_user' : 'platform_admin_complimentary_revoked',
        user_id: user.id,
        summary: isComplimentary
          ? `Contrassegno omaggio FUORI TIER attivato per l\u2019utente ${targetId} dal platform admin ${user.email ?? user.id}. Motivo: ${reason}`
          : `Contrassegno omaggio rimosso per l\u2019utente ${targetId} dal platform admin ${user.email ?? user.id}`,
      })

      return json({ success: true })
    }


    if (action === 'set_password') {
      const targetId = String(body?.user_id ?? '')
      const newPassword = String(body?.new_password ?? '')
      if (!UUID_RE.test(targetId)) return json({ error: 'user_id non valido' }, 400)
      if (newPassword.length < 8) return json({ error: 'La password deve avere almeno 8 caratteri' }, 400)

      // email_confirm: la password impostata dal platform admin vale come
      // conferma dell'account (non tocca il flusso di conferma standard).
      // must_set_password viene azzerato: l'utente ha ora una password propria,
      // altrimenti resterebbe bloccato sul gate /set-password a vita.
      const { data: current } = await admin.auth.admin.getUserById(targetId)
      const { data: updated, error: uErr } = await admin.auth.admin.updateUserById(targetId, {
        password: newPassword,
        email_confirm: true,
        user_metadata: {
          ...(current?.user?.user_metadata ?? {}),
          must_set_password: false,
        },
      })
      if (uErr) return json({ error: uErr.message }, 400)

      // Audit log — nessun dato sensibile registrato
      await admin.from('audit_log').insert({
        entity_type: 'auth_user',
        entity_id: targetId,
        action: 'admin_set_password',
        user_id: user.id,
        summary: `Password impostata dal platform admin ${user.email ?? user.id} per ${updated?.user?.email ?? targetId}`,
      })

      return json({ success: true, user_id: targetId, email: updated?.user?.email ?? null })
    }

    return json({ error: 'Azione non supportata' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Errore inatteso' }, 500)
  }
})
