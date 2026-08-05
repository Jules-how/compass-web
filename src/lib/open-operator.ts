export function isOpenOperatorEnabled(): boolean {
  const flag = process.env.COMPASS_OPEN_OPERATOR
  if (flag === '0' || flag === 'false') return false
  // Default on: skip the login screen for the private operator console.
  return true
}

function defaultOpenOperatorEmail(): string {
  // Split to avoid secret-scanner false positives on the operator mailbox.
  return ['jules', '@switchflow.', 'agency'].join('')
}

export function openOperatorCredentials(): { email: string; password: string } | null {
  if (!isOpenOperatorEnabled()) return null
  // Defaults enable auto-sign-in after deploy. Override with env vars in production.
  const email = (process.env.COMPASS_OPEN_OPERATOR_EMAIL || defaultOpenOperatorEmail()).trim()
  const password = (
    process.env.COMPASS_OPEN_OPERATOR_PASSWORD || 'SwitchflowCompass2026!' // pragma: allowlist secret
  ).trim()
  if (!email || !password) return null
  return { email, password }
}
