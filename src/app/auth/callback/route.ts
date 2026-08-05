import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { safePortalRedirect, type PortalRole } from '@/lib/portal-redirect'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

interface ConsumeRow {
  tenant_id: string
  member_role: PortalRole
  landing_path: string
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const invitationId = requestUrl.searchParams.get('invitation')
  const requestedNext = requestUrl.searchParams.get('next')
  const response = NextResponse.redirect(new URL('/login?error=access_denied', requestUrl.origin))

  if (!supabaseUrl || !supabaseAnonKey || !code) return response

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      }
    }
  })

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) return response

  const { data, error: consumeError } = await supabase.rpc('portal_consume_invitation', {
    p_invitation_id: invitationId
  })
  const context = ((data ?? []) as ConsumeRow[])[0]
  if (consumeError || !context) {
    await supabase.auth.signOut()
    return response
  }

  const target = safePortalRedirect(requestedNext ?? context.landing_path, context.member_role)
  response.headers.set('location', new URL(target, requestUrl.origin).toString())
  return response
}
