import { createClient } from '@supabase/supabase-js'

/**
 * Server-only: a Supabase client using the service-role key. Bypasses RLS —
 * only for API routes calling SECURITY DEFINER RPCs that were revoked from
 * the authenticated role. NEVER import this into client components.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase service-role env not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)'
    )
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
