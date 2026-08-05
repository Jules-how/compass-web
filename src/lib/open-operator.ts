export function isOpenOperatorEnabled(): boolean {
  const flag = process.env.COMPASS_OPEN_OPERATOR
  if (flag === '0' || flag === 'false') return false
  // Default on: skip the login screen for the private operator console.
  return true
}

export function openOperatorCredentials(): { email: string; password: string } | null {
  if (!isOpenOperatorEnabled()) return null
  const email = (process.env.COMPASS_OPEN_OPERATOR_EMAIL || '').trim()
  const password = (process.env.COMPASS_OPEN_OPERATOR_PASSWORD || '').trim()
  if (!email || !password) return null
  return { email, password }
}
