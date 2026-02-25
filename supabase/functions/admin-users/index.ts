import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Verify the caller is admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    // Client with caller's token to check admin
    const token = authHeader.replace('Bearer ', '')
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser(token)
    if (authError || !caller) throw new Error('Not authenticated')

    const { data: adminCheck } = await callerClient
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .eq('role', 'admin')
    if (!adminCheck || adminCheck.length === 0) throw new Error('Admin access required')

    // Admin client with service role
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { action, ...params } = await req.json()

    if (action === 'invite') {
      const { email, role } = params
      if (!email) throw new Error('Email is required')

      // Create user via admin API (auto-confirms)
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        password: crypto.randomUUID().slice(0, 12) + 'A1!', // temp password
      })
      if (createError) throw createError

      // Assign role if provided
      if (role && newUser.user) {
        await adminClient.from('user_roles').insert({ user_id: newUser.user.id, role })
      }

      return new Response(JSON.stringify({ success: true, user_id: newUser.user?.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'delete') {
      const { user_id } = params
      if (!user_id) throw new Error('user_id is required')
      if (user_id === caller.id) throw new Error('Cannot delete yourself')

      const { error } = await adminClient.auth.admin.deleteUser(user_id)
      if (error) throw error

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'update_role') {
      const { user_id, old_role, new_role } = params
      if (!user_id || !new_role) throw new Error('user_id and new_role required')

      // Delete old role if specified
      if (old_role) {
        await adminClient.from('user_roles').delete().eq('user_id', user_id).eq('role', old_role)
      }
      // Insert new role
      const { error } = await adminClient.from('user_roles').upsert(
        { user_id, role: new_role },
        { onConflict: 'user_id,role' }
      )
      if (error) throw error

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'list_users') {
      const { data: profiles } = await adminClient.from('profiles').select('*').order('created_at')
      const { data: roles } = await adminClient.from('user_roles').select('*')

      return new Response(JSON.stringify({ profiles: profiles || [], roles: roles || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'reset_password') {
      const { email } = params
      if (!email) throw new Error('Email required')

      const tempPass = crypto.randomUUID().slice(0, 12) + 'A1!'
      const { data: profile } = await adminClient.from('profiles').select('id').eq('email', email).single()
      if (!profile) throw new Error('User not found')

      const { error } = await adminClient.auth.admin.updateUserById(profile.id, { password: tempPass })
      if (error) throw error

      return new Response(JSON.stringify({ success: true, temp_password: tempPass }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'reset_password_direct') {
      const { user_id, new_password } = params
      if (!user_id || !new_password) throw new Error('user_id and new_password required')

      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password: new_password })
      if (error) throw error

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'list_project_members') {
      const { project_id } = params
      if (!project_id) throw new Error('project_id required')
      const { data } = await adminClient.from('project_members').select('*').eq('project_id', project_id)
      return new Response(JSON.stringify({ members: data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'add_project_member') {
      const { project_id, user_id, role } = params
      if (!project_id || !user_id || !role) throw new Error('project_id, user_id, role required')
      const { error } = await adminClient.from('project_members').insert({ project_id, user_id, role })
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'update_project_member_role') {
      const { member_id, new_role } = params
      if (!member_id || !new_role) throw new Error('member_id and new_role required')
      const { error } = await adminClient.from('project_members').update({ role: new_role }).eq('id', member_id)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'remove_project_member') {
      const { member_id } = params
      if (!member_id) throw new Error('member_id required')
      const { error } = await adminClient.from('project_members').delete().eq('id', member_id)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Unknown action: ' + action)
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
