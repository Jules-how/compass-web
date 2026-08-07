'use client'

import { useState } from 'react'

export default function PasswordLoginForm({ invitationId }: { invitationId?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'signing_in' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setStatus('signing_in')
    setError(null)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, invitationId })
      })
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        redirectTo?: string
        error?: string
      }
      if (!response.ok || !body.ok || !body.redirectTo) {
        setError('Email or password is incorrect.')
        setStatus('error')
        return
      }
      window.location.assign(body.redirectTo)
    } catch {
      setError('Email or password is incorrect.')
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-neutral-700">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="compass-input"
          disabled={status === 'signing_in'}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-neutral-700">Password</span>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          className="compass-input"
          disabled={status === 'signing_in'}
        />
      </label>
      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      <button
        type="submit"
        disabled={status === 'signing_in'}
        className="compass-btn-primary w-full"
      >
        {status === 'signing_in' ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
