/**
 * admin-delete-organization — cancellazione definitiva di un'organizzazione
 * cliente e di tutti i dati collegati. Riservata al livello PIATTAFORMA
 * (public.platform_admins), stessa logica di autorizzazione delle altre
 * funzioni admin (rpc is_platform_admin).
 *
 * Azioni:
 *  - preview { org_id } -> conteggi righe collegate (progetti, membri, item, ...)
 *  - delete  { org_id } -> elimina tutto rispettando le foreign key
 *
 * Nessuna chiave di servizio viene mai esposta al frontend: la service_role
 * è usata solo lato server, qui dentro.
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

type Admin = ReturnType<typeof createClient>

async function countIn(admin: Admin, table: string, col: string, values: string[]) {
  if (!values.length) return 0
  const { count } = await admin.from(table).select('id', { count: 'exact', head: true }).in(col, values)
  return count ?? 0
}

async function countEq(admin: Admin, table: string, col: string, value: string) {
  const { count } = await admin.from(table).select('id', { count: 'exact', head: true }).eq(col, value)
  return count ?? 0
}

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
    const action = String(body?.action ?? 'preview')
    const orgId = String(body?.org_id ?? '')
    if (!UUID_RE.test(orgId)) return json({ error: 'org_id non valido' }, 400)

    const { data: org, error: oErr } = await admin
      .from('organizations')
      .select('id, name, slug')
      .eq('id', orgId)
      .maybeSingle()
    if (oErr) return json({ error: oErr.message }, 400)
    if (!org) return json({ error: 'Organizzazione non trovata' }, 404)

    // Progetti e item collegati
    const { data: projRows } = await admin.from('projects').select('id').eq('organization_id', orgId)
    const projectIds = (projRows ?? []).map((p: any) => p.id as string)

    let itemIds: string[] = []
    if (projectIds.length) {
      const { data: itemRows } = await admin.from('project_items').select('id').in('project_id', projectIds)
      itemIds = (itemRows ?? []).map((i: any) => i.id as string)
    }

    if (action === 'preview') {
      const [members, invites, roles, tasks, boards, presentations, milestones, assignments] = await Promise.all([
        countEq(admin, 'organization_members', 'organization_id', orgId),
        countEq(admin, 'organization_invites', 'organization_id', orgId),
        countEq(admin, 'user_roles', 'organization_id', orgId),
        countIn(admin, 'project_tasks', 'project_id', projectIds),
        countIn(admin, 'client_boards', 'project_id', projectIds),
        countIn(admin, 'presentations', 'project_id', projectIds),
        countIn(admin, 'project_milestones', 'project_id', projectIds),
        countIn(admin, 'project_assignments', 'project_id', projectIds),
      ])
      return json({
        organization: { id: org.id, name: org.name, slug: org.slug },
        counts: {
          projects: projectIds.length,
          items: itemIds.length,
          members,
          invites,
          roles,
          tasks,
          client_boards: boards,
          presentations,
          milestones,
          assignments,
        },
      })
    }

    if (action !== 'delete') return json({ error: 'Azione non supportata' }, 400)

    const deleted: Record<string, number> = {}
    const del = async (table: string, col: string, values: string[] | string) => {
      if (Array.isArray(values)) {
        if (!values.length) { deleted[table] = deleted[table] ?? 0; return }
        const { data, error } = await admin.from(table).delete().in(col, values).select('id')
        if (error) throw new Error(`${table}: ${error.message}`)
        deleted[table] = (deleted[table] ?? 0) + (data?.length ?? 0)
      } else {
        const { data, error } = await admin.from(table).delete().eq(col, values).select('id')
        if (error) throw new Error(`${table}: ${error.message}`)
        deleted[table] = (deleted[table] ?? 0) + (data?.length ?? 0)
      }
    }

    // ── 1. Dipendenze degli item ──
    if (itemIds.length) {
      await del('item_costs', 'project_item_id', itemIds)
      await del('item_messages', 'project_item_id', itemIds)
      await del('item_quotations', 'project_item_id', itemIds)
      await del('item_revisions', 'item_id', itemIds)
      await del('supplier_payments', 'project_item_id', itemIds)
      await del('direct_messages', 'item_id', itemIds)
      // rimuove i legami padre/figlio e le dipendenze fra task prima delle delete
      await admin.from('project_items').update({ parent_item_id: null }).in('id', itemIds)
    }

    // ── 2. Dipendenze dei progetti ──
    if (projectIds.length) {
      await admin.from('project_tasks').update({ depends_on: null }).in('project_id', projectIds)
      await del('project_tasks', 'project_id', projectIds)
      await del('project_milestones', 'project_id', projectIds)
      await del('project_assignments', 'project_id', projectIds)
      await del('project_members', 'project_id', projectIds)
      await del('project_reopen_log', 'project_id', projectIds)
      await del('boq_coverage', 'project_id', projectIds)
      await del('client_boards', 'project_id', projectIds)
      await del('presentations', 'project_id', projectIds)
      await del('direct_messages', 'project_id', projectIds)
      await del('notifications', 'project_id', projectIds)
      await del('project_items', 'project_id', projectIds)
      await del('projects', 'organization_id', orgId)
    }

    // ── 3. Master data e impostazioni dell'organizzazione ──
    await del('master_subcategories', 'organization_id', orgId)
    await del('master_item_types', 'organization_id', orgId)
    await del('master_rooms', 'organization_id', orgId)
    await del('master_floors', 'organization_id', orgId)
    await del('cost_categories', 'organization_id', orgId)
    await del('company_settings', 'organization_id', orgId)

    // ── 4. Utenti, ruoli, inviti, domini, billing ──
    await del('user_roles', 'organization_id', orgId)
    await del('organization_invites', 'organization_id', orgId)
    await del('organization_role_labels', 'organization_id', orgId)
    await del('organization_members', 'organization_id', orgId)
    await del('organization_domains', 'organization_id', orgId)
    await del('organization_domain_audit', 'organization_id', orgId)
    await del('organization_subscriptions', 'organization_id', orgId)
    await del('discount_redemptions', 'organization_id', orgId)
    await del('referral_redemptions', 'referred_org_id', orgId)
    await del('referral_codes', 'organization_id', orgId)
    await del('security_flags', 'organization_id', orgId)
    await del('sso_tickets', 'organization_id', orgId)
    await del('platform_impersonation_log', 'target_organization_id', orgId)

    // ── 5. L'organizzazione ──
    const { error: delOrgErr } = await admin.from('organizations').delete().eq('id', orgId)
    if (delOrgErr) return json({ error: `organizations: ${delOrgErr.message}`, deleted }, 400)
    deleted['organizations'] = 1

    // ── Audit log ──
    await admin.from('audit_log').insert({
      entity_type: 'organization',
      entity_id: orgId,
      action: 'admin_delete_organization',
      user_id: user.id,
      summary: `Organizzazione "${org.name}" (${org.slug}) eliminata dal platform admin ${user.email ?? user.id}. Righe eliminate: ${JSON.stringify(deleted)}`,
    })

    return json({ success: true, organization: { id: orgId, name: org.name }, deleted })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Errore inatteso' }, 500)
  }
})
