/** Explicit local development convenience; never enabled on a hosted deployment. */
export function isOpenOperatorEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.COMPASS_OPEN_OPERATOR === '1'
}

export function openOperatorCredentials(): { email: string; password: string } | null {
  if (!isOpenOperatorEnabled()) return null
  const email = process.env.COMPASS_OPEN_OPERATOR_EMAIL?.trim()
  const password = process.env.COMPASS_OPEN_OPERATOR_PASSWORD
  if (!email || !password) return null
  return { email, password }
}
