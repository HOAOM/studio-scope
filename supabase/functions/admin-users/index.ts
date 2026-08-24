/**
 * admin-users — gestione utenti/membri di progetto.
 *
 * SICUREZZA: il ruolo applicativo 'admin' è SEMPRE scoped a un'organizzazione.
 * Un admin di organizzazione può operare SOLO sugli utenti e sui progetti della
 * propria organizzazione. I privilegi cross-organizzazione appartengono
 * esclusivamente al livello di piattaforma (public.platform_admins →
 * is_platform_admin()).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertOrgContext } from '../_shared/orgContext.ts'
import { isValidAppRole, isValidInviteEmail, sendOrgInvite } from '../_shared/sendOrgInvite.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const body = await req.json()
    const { action, ...params } = body

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── Autenticazione del chiamante ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')

    const token = authHeader.replace('Bearer ', '')
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser(token)
    if (authError || !caller) throw new Error('Not authenticated')

    // ── Autorizzazione: platform admin (globale) oppure org admin (scoped) ──
    const { data: platformAdmin } = await adminClient.rpc('is_platform_admin', { _user_id: caller.id })
    const isPlatformAdmin = platformAdmin === true

    // Organizzazioni di cui il chiamante è OWNER (non semplice org admin).
    const ownerOrgs = new Set<string>()
    {
      const { data: ownedOrgs } = await adminClient
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', caller.id)
        .eq('is_owner', true)
      for (const r of ownedOrgs ?? []) ownerOrgs.add(r.organization_id)
    }

    const adminOrgs = new Set<string>()
    if (!isPlatformAdmin) {
      for (const o of ownerOrgs) adminOrgs.add(o)

      const { data: adminRoles } = await adminClient
        .from('user_roles')
        .select('organization_id')
        .eq('user_id', caller.id)
        .eq('role', 'admin')
      for (const r of adminRoles ?? []) if (r.organization_id) adminOrgs.add(r.organization_id)

      if (adminOrgs.size === 0) throw new Error('Admin access required')
    }

    const orgList = [...adminOrgs]

    /**
     * Solo l'owner dell'organizzazione (o un platform admin) può creare/assegnare
     * il ruolo protetto 'admin'. Rispecchia le policy RLS su public.user_roles
     * (WITH CHECK role <> 'admin') e la logica di accept_org_invite().
     */
    const assertCanGrantAdminRole = (role: string | undefined, orgId: string | null) => {
      if (role !== 'admin') return
      if (isPlatformAdmin) return
      if (orgId && ownerOrgs.has(orgId)) return
      throw new Error("Solo il proprietario dell'organizzazione può assegnare il ruolo admin")
    }

    /** true se userId è owner dell'organizzazione indicata. */
    const isOwnerOfOrg = async (userId: string, orgId: string): Promise<boolean> => {
      const { data } = await adminClient
        .from('organization_members')
        .select('is_owner')
        .eq('organization_id', orgId)
        .eq('user_id', userId)
        .maybeSingle()
      return data?.is_owner === true
    }

    /** Numero di utenti che sono contemporaneamente owner e admin dell'org. */
    const adminOwnerCount = async (orgId: string): Promise<number> => {
      const [{ data: owners }, { data: admins }] = await Promise.all([
        adminClient.from('organization_members').select('user_id').eq('organization_id', orgId).eq('is_owner', true),
        adminClient.from('user_roles').select('user_id').eq('organization_id', orgId).eq('role', 'admin'),
      ])
      const ownerIds = new Set((owners ?? []).map((r: { user_id: string }) => r.user_id))
      const adminIds = new Set((admins ?? []).map((r: { user_id: string }) => r.user_id))
      let n = 0
      for (const id of ownerIds) if (adminIds.has(id)) n++
      return n
    }


    /** Organizzazioni (fra quelle amministrate) a cui appartiene un utente. */
    const userOrgs = async (userId: string): Promise<string[]> => {
      const { data } = await adminClient
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
      return (data ?? []).map((r: { organization_id: string }) => r.organization_id)
    }

    const assertUserInScope = async (userId: string) => {
      if (isPlatformAdmin) return
      const orgs = await userOrgs(userId)
      if (!orgs.some((o) => adminOrgs.has(o))) {
        throw new Error('Utente non appartenente alla tua organizzazione')
      }
    }

    const assertProjectInScope = async (projectId: string) => {
      if (isPlatformAdmin) return
      const { data } = await adminClient
        .from('projects')
        .select('organization_id')
        .eq('id', projectId)
        .maybeSingle()
      if (!data || !data.organization_id || !adminOrgs.has(data.organization_id)) {
        throw new Error('Progetto non appartenente alla tua organizzazione')
      }
    }

    /**
     * Organizzazione target per le azioni di scrittura.
     * Per un platform admin non membro dell'org, il contesto deve essere
     * esplicito: sessione View-as aperta su quell'org, oppure console
     * super-admin (`console_intent: true`, org scelta a mano nella UI).
     */
    const targetOrg = async (): Promise<string | null> => {
      const requested = params.organization_id as string | undefined
      const orgId = requested ?? orgList[0] ?? null
      if (requested && !isPlatformAdmin && !adminOrgs.has(requested)) {
        throw new Error('Organizzazione non consentita')
      }
      if (orgId) {
        await assertOrgContext(adminClient, {
          userId: caller.id,
          targetOrgId: orgId,
          isPlatformAdmin,
          isOrgMember: adminOrgs.has(orgId) || ownerOrgs.has(orgId),
          consoleIntent: params.console_intent === true,
        })
      }
      return orgId
    }


    if (action === 'invite') {
      // Percorso storico (UserManagement): creava un utente con password
      // generata, senza email e senza gate /set-password. Ora è reindirizzato
      // sull'unico canale di invito condiviso.
      const { email, role } = params
      if (!email) throw new Error('Email is required')
      const cleanEmail = String(email).trim().toLowerCase()
      if (!isValidInviteEmail(cleanEmail)) throw new Error('Email non valida')
      if (!isValidAppRole(String(role ?? ''))) throw new Error('Ruolo non valido')
      const orgId = await targetOrg()
      if (!orgId) throw new Error('organization_id is required')
      assertCanGrantAdminRole(role, orgId)

      const res = await sendOrgInvite(adminClient, {
        organizationId: orgId,
        email: cleanEmail,
        baseRole: role,
        isOwner: false,
        invitedBy: caller.id,
        req,
      })
      if (res.error) throw new Error(res.error)

      return new Response(
        JSON.stringify({
          success: true,
          invite_id: res.invite_id,
          accept_url: res.accept_url,
          email_sent: res.email_sent,
          existing_user: res.existing_user,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }


    if (action === 'delete') {
      const { user_id } = params
      if (!user_id) throw new Error('user_id is required')
      if (user_id === caller.id) throw new Error('Cannot delete yourself')
      await assertUserInScope(user_id)

      // Anti lock-out: l'owner di un'organizzazione non può essere rimosso da un
      // org admin; solo un platform admin può farlo.
      if (!isPlatformAdmin) {
        for (const o of adminOrgs) {
          if (await isOwnerOfOrg(user_id, o)) {
            throw new Error("Non puoi eliminare il proprietario dell'organizzazione")
          }
        }
      }


      if (!isPlatformAdmin) {
        // Un org admin non può cancellare un account condiviso con altre org:
        // lo rimuove solo dalla propria organizzazione.
        const orgs = await userOrgs(user_id)
        const outside = orgs.filter((o) => !adminOrgs.has(o))
        if (outside.length > 0) {
          await adminClient.from('organization_members').delete().eq('user_id', user_id).in('organization_id', orgList)
          await adminClient.from('user_roles').delete().eq('user_id', user_id).in('organization_id', orgList)
          return new Response(JSON.stringify({ success: true, removed_from_organization: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      const { error } = await adminClient.auth.admin.deleteUser(user_id)
      if (error) throw error

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'update_role') {
      const { user_id, old_role, new_role } = params
      if (!user_id || !new_role) throw new Error('user_id and new_role required')
      await assertUserInScope(user_id)
      const orgId = await targetOrg()
      assertCanGrantAdminRole(new_role, orgId)

      if (orgId) {
        const targetIsOwner = await isOwnerOfOrg(user_id, orgId)
        // Anti lock-out 1: solo owner/platform admin possono modificare i ruoli
        // del proprietario dell'organizzazione.
        if (targetIsOwner && !isPlatformAdmin && !ownerOrgs.has(orgId)) {
          throw new Error("Solo il proprietario dell'organizzazione può modificare i propri ruoli")
        }
        // Anti lock-out 2: non si rimuove l'ultimo owner con ruolo admin.
        if (old_role === 'admin' && new_role !== 'admin' && targetIsOwner) {
          if ((await adminOwnerCount(orgId)) <= 1) {
            throw new Error("Impossibile rimuovere l'ultimo admin proprietario dell'organizzazione")
          }
        }
      }



      let del = adminClient.from('user_roles').delete().eq('user_id', user_id)
      if (old_role) del = del.eq('role', old_role)
      if (!isPlatformAdmin) del = del.in('organization_id', orgList)
      else if (orgId) del = del.eq('organization_id', orgId)
      if (old_role) await del

      const { error } = await adminClient.from('user_roles').upsert(
        { user_id, role: new_role, organization_id: orgId },
        { onConflict: 'user_id,role,organization_id' }
      )
      if (error) throw error

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'list_users') {
      if (isPlatformAdmin) {
        const { data: profiles } = await adminClient.from('profiles').select('*').order('created_at')
        const { data: roles } = await adminClient.from('user_roles').select('*')
        return new Response(JSON.stringify({ profiles: profiles || [], roles: roles || [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: members } = await adminClient
        .from('organization_members')
        .select('user_id')
        .in('organization_id', orgList)
      const memberIds = [...new Set((members ?? []).map((m: { user_id: string }) => m.user_id))]

      const { data: profiles } = memberIds.length
        ? await adminClient.from('profiles').select('*').in('id', memberIds).order('created_at')
        : { data: [] as unknown[] }
      const { data: roles } = await adminClient
        .from('user_roles')
        .select('*')
        .in('organization_id', orgList)

      return new Response(JSON.stringify({ profiles: profiles || [], roles: roles || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'reset_password') {
      const { email } = params
      if (!email) throw new Error('Email required')

      const tempPass = crypto.randomUUID().slice(0, 12) + 'A1!'
      const { data: profile } = await adminClient.from('profiles').select('id').eq('email', email).maybeSingle()
      if (!profile) throw new Error('User not found')
      await assertUserInScope(profile.id)

      const { error } = await adminClient.auth.admin.updateUserById(profile.id, { password: tempPass })
      if (error) throw error

      return new Response(JSON.stringify({ success: true, temp_password: tempPass }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'confirm_email') {
      const { user_id } = params
      if (!user_id) throw new Error('user_id required')
      await assertUserInScope(user_id)
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { email_confirm: true })
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'reset_password_direct') {
      const { user_id, new_password } = params
      if (!user_id || !new_password) throw new Error('user_id and new_password required')
      await assertUserInScope(user_id)

      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password: new_password })
      if (error) throw error

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'list_project_members') {
      const { project_id } = params
      if (!project_id) throw new Error('project_id required')
      await assertProjectInScope(project_id)
      const { data } = await adminClient.from('project_members').select('*').eq('project_id', project_id)
      return new Response(JSON.stringify({ members: data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'add_project_member') {
      const { project_id, user_id, role } = params
      if (!project_id || !user_id || !role) throw new Error('project_id, user_id, role required')
      await assertProjectInScope(project_id)
      await assertUserInScope(user_id)
      const { error } = await adminClient.from('project_members').insert({ project_id, user_id, role })
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'update_project_member_role') {
      const { member_id, new_role } = params
      if (!member_id || !new_role) throw new Error('member_id and new_role required')
      const { data: member } = await adminClient
        .from('project_members')
        .select('project_id')
        .eq('id', member_id)
        .maybeSingle()
      if (!member) throw new Error('Member not found')
      await assertProjectInScope(member.project_id)
      const { error } = await adminClient.from('project_members').update({ role: new_role }).eq('id', member_id)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'remove_project_member') {
      const { member_id } = params
      if (!member_id) throw new Error('member_id required')
      const { data: member } = await adminClient
        .from('project_members')
        .select('project_id')
        .eq('id', member_id)
        .maybeSingle()
      if (!member) throw new Error('Member not found')
      await assertProjectInScope(member.project_id)
      const { error } = await adminClient.from('project_members').delete().eq('id', member_id)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Unknown action: ' + action)
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
