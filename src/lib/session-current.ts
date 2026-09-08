/** Apply an operator-requested session cutoff after an account security reset. */
export function isSessionCurrent(
  user: { app_metadata?: Record<string, unknown> },
  accessToken?: string,
): boolean {
  const cutoff = Number(user.app_metadata?.compass_session_not_before || 0)
  if (!cutoff) return true
  try {
    const payload = accessToken?.split('.')[1]
    if (!payload) return false
    const claims = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    )
    return typeof claims.iat === 'number' && claims.iat >= cutoff
  } catch {
    return false
  }
}
