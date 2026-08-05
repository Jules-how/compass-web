import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

import { parsePasswordLoginRequest } from '@/lib/portal-contracts'
import { portalJson, readBoundedJson, requireSameOrigin } from '@/lib/portal-http'
import { safePortalRedirect, type PortalRole } from '@/lib/portal-redirect'

export const dynamic = 'force-dynamic'

interface ConsumeRow {
  tenant_id: string
  member_role: PortalRole
  landing_path: string
}

const GENERIC_FAIL = { error: 'invalid_credentials' }

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let input
  try {
    input = parsePasswordLoginRequest(await readBoundedJson(request, 4096))
  } catch {
    return portalJson(GENERIC_FAIL, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return portalJson({ error: 'auth_not_configured' }, { status: 503 })
  }

  let cookiesToApply: { name: string; value: string; options: CookieOptions }[] = []
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToApply = cookiesToSet
      }
    }
  })

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password
  })
  if (signInError) return portalJson(GENERIC_FAIL, { status: 401 })

  const { data, error: consumeError } = await supabase.rpc('portal_consume_invitation', {
    p_invitation_id: input.invitationId ?? null
  })
  const context = ((data ?? []) as ConsumeRow[])[0]
  if (consumeError || !context) {
    await supabase.auth.signOut()
    cookiesToApply = []
    return portalJson(GENERIC_FAIL, { status: 401 })
  }

  const redirectTo = safePortalRedirect(context.landing_path, context.member_role)
  const response = portalJson({ ok: true, redirectTo }, { status: 200 })
  cookiesToApply.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  return response
}
