/** Operator-console convenience. Enabled by default; set COMPASS_OPEN_OPERATOR=0 to require login. */
export function isOpenOperatorEnabled(): boolean {
  return process.env.COMPASS_OPEN_OPERATOR !== '0'
}

export function openOperatorCredentials(): { email: string; password: string } | null {
  if (!isOpenOperatorEnabled()) return null
  const email = process.env.COMPASS_OPEN_OPERATOR_EMAIL?.trim()
  const password = process.env.COMPASS_OPEN_OPERATOR_PASSWORD
  if (!email || !password) return null
  return { email, password }
}
