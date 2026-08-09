import { portalJson } from '@/lib/portal-http'

/** Shared secret for Cursor local/cloud agents and automation. */
export function getAgentSecret(): string | null {
  const secret = process.env.COMPASS_AGENT_SECRET?.trim()
  return secret || null
}

/** Vercel Cron Authorization: Bearer <CRON_SECRET>. Falls back to agent secret. */
export function getCronSecret(): string | null {
  const cron = process.env.CRON_SECRET?.trim()
  if (cron) return cron
  return getAgentSecret()
}

export function secretsMatch(provided: string | null | undefined, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}

function extractBearer(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() || null
}

/** Accept `x-compass-agent-secret` or `Authorization: Bearer <secret>`. */
export function readAgentCredential(request: Request): string | null {
  const header = request.headers.get('x-compass-agent-secret')?.trim()
  if (header) return header
  return extractBearer(request.headers.get('authorization'))
}

export function requireAgentAuth(request: Request): Response | null {
  const expected = getAgentSecret()
  if (!expected) return portalJson({ error: 'agent_not_configured' }, { status: 503 })
  const provided = readAgentCredential(request)
  if (!secretsMatch(provided, expected)) {
    return portalJson({ error: 'unauthorized' }, { status: 401 })
  }
  return null
}

/** Cron may use CRON_SECRET or COMPASS_AGENT_SECRET. */
export function requireCronAuth(request: Request): Response | null {
  const expected = getCronSecret()
  if (!expected) return portalJson({ error: 'cron_not_configured' }, { status: 503 })
  const provided = readAgentCredential(request)
  if (!secretsMatch(provided, expected)) {
    return portalJson({ error: 'unauthorized' }, { status: 401 })
  }
  return null
}
