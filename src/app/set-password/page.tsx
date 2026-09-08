'use client'
import { useEffect, useState } from 'react'
export default function SetPasswordPage() {
  const [token, setToken] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    setToken(
      new URLSearchParams(window.location.hash.slice(1)).get('token_hash') ||
        '',
    )
    window.history.replaceState(null, '', '/set-password')
  }, [])
  async function save(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenHash: token, password }),
      })
      const b = await r.json()
      if (!r.ok) throw new Error(b.error)
      window.location.assign('/tasks')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to set password.')
      setBusy(false)
    }
  }
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-8 shadow-soft">
        <h1 className="text-2xl font-semibold">Set your Compass password</h1>
        <p className="my-4 text-sm text-neutral-600">
          Choose a unique password. This private setup link can only be used
          once.
        </p>
        {error && (
          <p role="alert" className="my-4 text-red-700">
            {error}
          </p>
        )}
        <form onSubmit={save} className="space-y-4">
          <label className="block text-sm">
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={200}
              required
              className="compass-input mt-1 w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={200}
              required
              className="compass-input mt-1 w-full"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <button disabled={busy || !token} className="compass-btn-primary">
            {busy ? 'Saving…' : 'Set password and sign in'}
          </button>
          {!token && (
            <p className="text-sm text-neutral-500">
              Open your private setup link to continue.
            </p>
          )}
        </form>
      </div>
    </main>
  )
}
