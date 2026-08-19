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

    // ── Autenticazione chiamante ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No authorization header' }, 401)
    const token = authHeader.replace('Bearer ', '')
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await caller.auth.getUser(token)
    if (authError || !user) return json({ error: 'Not authenticated' }, 401)

    // ── Autorizzazione: solo platform admin ──
    const { data: isPlatformAdmin } = await admin.rpc('is_platform_admin', { _user_id: user.id })
    if (isPlatformAdmin !== true) return json({ error: 'Platform admin access required' }, 403)

    const body = await req.json().catch(() => ({}))
    const action = String(body?.action ?? 'set_password')

    if (action === 'list_members') {
      const orgId = String(body?.organization_id ?? '')
      if (!UUID_RE.test(orgId)) return json({ error: 'organization_id non valido' }, 400)

      const { data: members, error: mErr } = await admin
        .from('organization_members')
        .select('user_id, is_owner, joined_at, is_complimentary, complimentary_reason')
        .eq('organization_id', orgId)
      if (mErr) return json({ error: mErr.message }, 400)

      const ids = (members ?? []).map((m: { user_id: string }) => m.user_id)
      let profiles: Record<string, { email: string | null; display_name: string | null }> = {}
      let rolesByUser: Record<string, string[]> = {}
      if (ids.length) {
        const { data: profs } = await admin
          .from('profiles')
          .select('id, email, display_name')
          .in('id', ids)
        for (const p of profs ?? []) {
          profiles[p.id] = { email: p.email, display_name: p.display_name }
        }
        const { data: roles } = await admin
          .from('user_roles')
          .select('user_id, role')
          .eq('organization_id', orgId)
          .in('user_id', ids)
        for (const r of roles ?? []) {
          ;(rolesByUser[r.user_id] ??= []).push(r.role)
        }
      }

      // Inviti in sospeso (inclusi quelli omaggio non ancora accettati)
      const { data: invites } = await admin
        .from('organization_invites')
        .select('id, email, base_role, status, is_complimentary, complimentary_reason, expires_at')
        .eq('organization_id', orgId)
        .eq('status', 'pending')

      return json({
        members: (members ?? []).map((m: any) => ({
          user_id: m.user_id,
          is_owner: m.is_owner,
          joined_at: m.joined_at,
          is_complimentary: m.is_complimentary === true,
          complimentary_reason: m.complimentary_reason ?? null,
          roles: rolesByUser[m.user_id] ?? [],
          email: profiles[m.user_id]?.email ?? null,
          display_name: profiles[m.user_id]?.display_name ?? null,
        })),
        invites: invites ?? [],
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
        // Invito: i flag viaggiano sull'invito e vengono propagati all'accettazione
        const origin = req.headers.get('origin') ?? ''
        const siteUrl = origin.replace(/\/$/, '') ||
          Deno.env.get('SITE_URL') || 'https://studio-scope.lovable.app'

        const { data: inv, error: invErr } = await admin
          .from('organization_invites')
          .insert({
            organization_id: orgId,
            email,
            base_role: role,
            is_owner: false,
            invited_by: user.id,
            token: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
            is_complimentary: isComplimentary,
            complimentary_reason: isComplimentary ? reason : null,
            is_over_tier_limit: overTier,
          })
          .select('id, token')
          .single()
        if (invErr) return json({ error: invErr.message }, 400)

        acceptUrl = `${siteUrl}/accept-invite?token=${inv.token}`
        const { error: mailErr } = await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo: acceptUrl,
        })
        emailSent = !mailErr
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

      const { data: updated, error: uErr } = await admin.auth.admin.updateUserById(targetId, {
        password: newPassword,
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
