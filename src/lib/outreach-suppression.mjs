export function isPermanentSuppression(status) {
  return ['unsubscribed', 'suppressed', 'dead'].includes(String(status || '').toLowerCase())
}
