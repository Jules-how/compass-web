/** Session unlock for destructive outbound library mutations (edit / archive). */

export const LIBRARY_LOCK_SESSION_KEY = 'compass.outbound.library.unlock.v1'

export function isLibraryMutationUnlocked(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(LIBRARY_LOCK_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export function markLibraryMutationUnlocked() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(LIBRARY_LOCK_SESSION_KEY, '1')
  } catch {
    /* ignore quota / private mode */
  }
}

export function lockLibraryMutations() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(LIBRARY_LOCK_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Prompt for the library lock password (once per tab session) before edit/archive.
 * Add remains unlocked. Returns false if the user cancels or the password is wrong.
 */
export async function ensureLibraryMutationUnlocked(
  action: 'edit' | 'archive' = 'edit'
): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (isLibraryMutationUnlocked()) return true

  const password = window.prompt(
    `Library lock password required to ${action} components.\n(Add is always free; unlock lasts for this browser tab.)`
  )
  if (password == null) return false
  if (!password.trim()) {
    window.alert('Password required.')
    return false
  }

  try {
    const res = await fetch('/api/outbound/library-lock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: password.trim() })
    })
    if (!res.ok) {
      window.alert('Incorrect library lock password.')
      return false
    }
  } catch {
    window.alert('Could not verify library lock password.')
    return false
  }

  markLibraryMutationUnlocked()
  return true
}
