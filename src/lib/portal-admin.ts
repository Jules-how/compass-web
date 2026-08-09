import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let adminClient: SupabaseClient | null = null

// Restricted to invitation administration, secret-authenticated ingest,
// and the Cursor agent / cron bridge. Cookie-authenticated customer routes
// must use the RLS client instead.
export function getPortalAdminClient(): SupabaseClient {
  if (adminClient) return adminClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('portal invitation administration is not configured')
  adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  return adminClient
}
