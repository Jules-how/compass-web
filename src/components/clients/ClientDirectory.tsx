'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { CompassClientCard } from '@/lib/types'
import { CLIENT_STATUSES, clientStatusLabel, formatRelativeTouch } from '@/lib/client-pm'

interface ClientDirectoryProps {
  clients: CompassClientCard[]
  onRefresh: () => Promise<void>
}

const emptyForm = {
  name: '',
  industry: '',
  website: '',
  main_contact_name: '',
  main_contact_role: '',
  engagement_type: '',
  retainer_status: '',
  status: 'onboarding',
  tags: ''
}

export function ClientDirectory({ clients, onRefresh }: ClientDirectoryProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((client) => {
      const haystack = [
        client.name,
        client.industry,
        client.main_contact_name,
        client.engagement_type,
        ...(client.tags ?? [])
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [clients, query])

  async function createClient(event: React.FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          industry: form.industry.trim() || null,
          website: form.website.trim() || null,
          main_contact_name: form.main_contact_name.trim() || null,
          main_contact_role: form.main_contact_role.trim() || null,
          engagement_type: form.engagement_type.trim() || null,
          retainer_status: form.retainer_status.trim() || null,
          status: form.status,
          tags: form.tags
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      setForm(emptyForm)
      setShowCreate(false)
      await onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients…"
            className="w-full max-w-sm rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
          />
          <span className="text-xs text-neutral-500">{filtered.length} active</span>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((open) => !open)}
          className="rounded-lg bg-sf-orange px-4 py-2 text-sm font-medium text-white hover:bg-sf-orange-dark"
        >
          {showCreate ? 'Cancel' : 'Add client'}
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {showCreate ? (
        <form onSubmit={createClient} className="compass-panel space-y-4 p-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-neutral-900">New client</h2>
            <p className="text-sm text-neutral-500">Short create flow — refine the profile inside the account.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-xs text-neutral-500">Company name</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((row) => ({ ...row, name: e.target.value }))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Industry</span>
              <input
                value={form.industry}
                onChange={(e) => setForm((row) => ({ ...row, industry: e.target.value }))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Website</span>
              <input
                value={form.website}
                onChange={(e) => setForm((row) => ({ ...row, website: e.target.value }))}
                placeholder="https://"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Main contact</span>
              <input
                value={form.main_contact_name}
                onChange={(e) => setForm((row) => ({ ...row, main_contact_name: e.target.value }))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Role</span>
              <input
                value={form.main_contact_role}
                onChange={(e) => setForm((row) => ({ ...row, main_contact_role: e.target.value }))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Engagement type</span>
              <input
                value={form.engagement_type}
                onChange={(e) => setForm((row) => ({ ...row, engagement_type: e.target.value }))}
                placeholder="Growth, AI build, mixed…"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Retainer status</span>
              <input
                value={form.retainer_status}
                onChange={(e) => setForm((row) => ({ ...row, retainer_status: e.target.value }))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm((row) => ({ ...row, status: e.target.value }))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                disabled={saving}
              >
                {CLIENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {clientStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-xs text-neutral-500">Tags</span>
              <input
                value={form.tags}
                onChange={(e) => setForm((row) => ({ ...row, tags: e.target.value }))}
                placeholder="growth, ai-build, meta…"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                disabled={saving}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="rounded-lg bg-sf-orange px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Creating…' : 'Create client'}
          </button>
        </form>
      ) : null}

      {filtered.length === 0 ? (
        <div className="compass-panel p-8 text-center text-sm text-neutral-500">
          {clients.length === 0
            ? 'No clients yet. Add your first account to open a workspace.'
            : 'No clients match that search.'}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className="block rounded-lg border border-stone-200 bg-stone-50 p-5 transition hover:border-stone-300 hover:bg-white"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-base font-semibold text-neutral-900">{client.name}</h3>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-600 ring-1 ring-inset ring-stone-200">
                  {clientStatusLabel(client.status)}
                </span>
              </div>
              <p className="mt-3 text-sm text-neutral-500">
                Last touch · {formatRelativeTouch(client.last_touch_at)}
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                Next · {client.next_action || 'No open issues'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
