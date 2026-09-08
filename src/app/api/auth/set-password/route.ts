import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest } from 'next/server'
import {
  portalJson,
  readBoundedJson,
  requireSameOrigin,
} from '@/lib/portal-http'
import { checkOnboardingRateLimit } from '@/lib/onboarding-rate-limit'
export const dynamic = 'force-dynamic'
export async function POST(request: NextRequest) {
  const origin = requireSameOrigin(request)
  if (origin) return origin
  const limited = checkOnboardingRateLimit(request, 'password-setup', 'write')
  if (!limited.ok)
    return portalJson(
      { error: 'Please wait before trying again.' },
      { status: 429 },
    )
  try {
    const input = (await readBoundedJson(request, 4096)) as {
      tokenHash?: string
      password?: string
    }
    if (
      typeof input.tokenHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(input.tokenHash) ||
      typeof input.password !== 'string' ||
      input.password.length < 12 ||
      input.password.length > 200
    )
      throw new Error(
        'Use the private setup link and a password of at least 12 characters.',
      )
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Sign-in is not configured.')
    let pending: { name: string; value: string; options: CookieOptions }[] = []
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => [],
        setAll: (c: { name: string; value: string; options: CookieOptions }[]) => {
          pending = c
        },
      },
    })
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: input.tokenHash,
      type: 'recovery',
    })
    if (verifyError)
      throw new Error('This setup link expired or has already been used.')
    const { data: access, error: accessError } = await supabase.rpc(
      'portal_access_context',
    )
    if (
      accessError ||
      !access?.some((r: { member_role: string }) =>
        ['owner', 'operator'].includes(r.member_role),
      )
    ) {
      await supabase.auth.signOut()
      throw new Error('This account does not have operator access.')
    }
    const { error: updateError } = await supabase.auth.updateUser({
      password: input.password,
    })
    if (updateError) {
      await supabase.auth.signOut()
      throw new Error(
        'Password could not be updated. A new setup link may be needed.',
      )
    }
    const response = portalJson({ ok: true })
    pending.forEach((c) => response.cookies.set(c.name, c.value, c.options))
    return response
  } catch (e) {
    return portalJson(
      { error: e instanceof Error ? e.message : 'Unable to set password.' },
      { status: 400 },
    )
  }
}
