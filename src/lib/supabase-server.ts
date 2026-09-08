import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isSessionCurrent } from './session-current'
import type { SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Server Supabase client bound to the request cookies via @supabase/ssr.
// Use this for server components and route handlers that need the user's
// authenticated session (RLS is enforced as the logged-in user).
export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Copy .env.example to .env.local and fill in your Supabase project credentials.'
    )
  }
  const cookieStore = await cookies()
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // setAll is invoked by the Supabase client to refresh tokens; when a
          // server component is rendering it runs in a read-only cookies context
          // and throws. The refresh is retried on the next request via middleware.
        }
      }
    }
  })
}

// Returns the authenticated user, or null when there is no session. Server
// components and route handlers use this to gate pages and APIs.
export async function getAuthenticatedUser() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (user?.app_metadata?.compass_session_not_before) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!isSessionCurrent(user, session?.access_token)) return null
  }
  return user
}
