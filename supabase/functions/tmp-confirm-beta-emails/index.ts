/**
 * tmp-confirm-beta-emails — fix una tantum: conferma l'email degli account beta
 * gia' provvisti di password ma con email_confirmed_at NULL. Non tocca password.
 * Da eliminare subito dopo l'esecuzione.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TARGETS = [
  '92301045-7bb2-4e37-a262-50db12229452', // +igor
  '7ebdb5d6-d60f-4444-963b-6db10406f5ce', // +enrico
  'e85c0e8b-d95b-485b-ac4e-cec9cdc342e5', // +uno
  '5636b2bc-dc61-487e-82a0-df752f62483d', // +due
  '552018e0-2e36-43ac-96e9-5c99381e005e', // +tre
]

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const results: unknown[] = []
  for (const id of TARGETS) {
    const { data, error } = await admin.auth.admin.updateUserById(id, { email_confirm: true })
    results.push({ id, email: data?.user?.email ?? null, error: error?.message ?? null })
  }
  return new Response(JSON.stringify({ results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
