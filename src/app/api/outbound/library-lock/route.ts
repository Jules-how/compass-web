import type { NextRequest } from 'next/server'
import { portalJson, requireSameOrigin } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

/** Default friction passphrase when COMPASS_LIBRARY_LOCK_PASSWORD is unset. */
function libraryLockPassword(): string {
  return (process.env.COMPASS_LIBRARY_LOCK_PASSWORD || 'compass-library').trim()
}

/** Verify library lock password before edit/archive of outbound components. */
export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  const password =
    body && typeof body === 'object' && typeof (body as { password?: unknown }).password === 'string'
      ? (body as { password: string }).password.trim()
      : ''

  if (!password || password !== libraryLockPassword()) {
    return portalJson({ error: 'unauthorized' }, { status: 401 })
  }

  return portalJson({ ok: true })
}
