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
        .select('user_id, is_owner, joined_at')
        .eq('organization_id', orgId)
      if (mErr) return json({ error: mErr.message }, 400)

      const ids = (members ?? []).map((m: { user_id: string }) => m.user_id)
      let profiles: Record<string, { email: string | null; display_name: string | null }> = {}
      if (ids.length) {
        const { data: profs } = await admin
          .from('profiles')
          .select('id, email, display_name')
          .in('id', ids)
        for (const p of profs ?? []) {
          profiles[p.id] = { email: p.email, display_name: p.display_name }
        }
      }

      return json({
        members: (members ?? []).map((m: any) => ({
          user_id: m.user_id,
          is_owner: m.is_owner,
          joined_at: m.joined_at,
          email: profiles[m.user_id]?.email ?? null,
          display_name: profiles[m.user_id]?.display_name ?? null,
        })),
      })
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
