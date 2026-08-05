export type PortalRole = 'owner' | 'operator' | 'customer'

const OPERATOR_ROOTS = [
  '/tasks',
  '/leads',
  '/delivery',
  '/inbox',
  '/projects',
  '/functions'
]
const CUSTOMER_ROOTS = ['/leads']

export function isOperatorRole(role: PortalRole | null | undefined): boolean {
  return role === 'owner' || role === 'operator'
}

export function safePortalRedirect(
  candidate: string | null | undefined,
  role: PortalRole = 'customer'
): string {
  const fallback = isOperatorRole(role) ? '/tasks' : '/leads'
  if (!candidate || candidate.length > 512 || /[\u0000-\u001f\\]/.test(candidate)) return fallback

  let decoded: string
  try {
    decoded = decodeURIComponent(candidate)
  } catch {
    return fallback
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\')) return fallback

  let url: URL
  try {
    url = new URL(candidate, 'https://portal.invalid')
  } catch {
    return fallback
  }
  if (url.origin !== 'https://portal.invalid' || url.hash) return fallback

  const roots = isOperatorRole(role) ? OPERATOR_ROOTS : CUSTOMER_ROOTS
  const allowed = roots.some((root) => url.pathname === root || url.pathname.startsWith(`${root}/`))
  if (!allowed) return fallback
  return `${url.pathname}${url.search}`
}
