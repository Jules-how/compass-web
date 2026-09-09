'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CompassClientCard } from '@/lib/types'
import {
  CLIENT_STATUSES,
  clientStatusLabel,
  formatRelativeTouch,
} from '@/lib/client-pm'
import { prefetchJson } from '@/lib/use-cached-json'
import { ClientDetailModal } from '@/components/clients/ClientDetailModal'

interface ClientDirectoryProps {
  clients: CompassClientCard[]
  onRefresh: () => Promise<void>
  initialClientId?: string | null
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
  tags: '',
}

function readClientIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const fromQuery = params.get('client')
  if (fromQuery) return fromQuery
  const match = window.location.pathname.match(/^\/clients\/([^/]+)\/?$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function syncClientIdToUrl(clientId: string | null) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  // Keep the directory route canonical so popup state is query-driven.
  url.pathname = '/clients'
  if (clientId) url.searchParams.set('client', clientId)
  else url.searchParams.delete('client')
  const next = `${url.pathname}${url.search}${url.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (next !== current) window.history.replaceState(null, '', next)
}

export function ClientDirectory({
  clients,
  onRefresh,
  initialClientId = null,
}: ClientDirectoryProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    () => initialClientId ?? readClientIdFromUrl(),
  )

  useEffect(() => {
    const fromUrl = readClientIdFromUrl()
    const nextId = initialClientId ?? fromUrl
    if (nextId) {
      setSelectedClientId(nextId)
      syncClientIdToUrl(nextId)
    }
    function onPopState() {
      setSelectedClientId(readClientIdFromUrl())
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [initialClientId])

  const openClient = useCallback((clientId: string) => {
    setSelectedClientId(clientId)
    syncClientIdToUrl(clientId)
  }, [])

  const closeClient = useCallback(() => {
    setSelectedClientId(null)
    syncClientIdToUrl(null)
  }, [])

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((client) => {
      const haystack = [
        client.name,
        client.industry,
        client.main_contact_name,
        client.engagement_type,
        ...(client.tags ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [clients, query])

  function prefetchClient(clientId: string) {
    const key = `/api/clients/${clientId}`
    prefetchJson(key, key)
  }

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
          tags: form.tags,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      const created = (await res.json().catch(() => null)) as {
        id?: string
      } | null
      setForm(emptyForm)
      setShowCreate(false)
      await onRefresh()
      if (created?.id) openClient(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            aria-label="Search clients"
            placeholder="Search clients…"
            className="compass-input max-w-sm"
          />
          <span className="shrink-0 text-xs tabular-nums text-neutral-500">
            {filtered.length} {filtered.length === 1 ? 'client' : 'clients'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((open) => !open)}
          className={
            showCreate ? 'compass-btn-secondary' : 'compass-btn-primary'
          }
        >
          {showCreate ? 'Cancel' : 'Add client'}
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {showCreate ? (
        <form onSubmit={createClient} className="compass-panel space-y-4 p-6">
          <div>
            <h2 className="font-display text-lg font-semibold text-neutral-900">
              New client
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Short create flow — refine the profile in the account panel.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm md:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                Company name
              </span>
              <input
                required
                value={form.name}
                onChange={(e) =>
                  setForm((row) => ({ ...row, name: e.target.value }))
                }
                className="compass-input"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                Industry
              </span>
              <input
                value={form.industry}
                onChange={(e) =>
                  setForm((row) => ({ ...row, industry: e.target.value }))
                }
                className="compass-input"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                Website
              </span>
              <input
                value={form.website}
                onChange={(e) =>
                  setForm((row) => ({ ...row, website: e.target.value }))
                }
                placeholder="https://"
                className="compass-input"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                Main contact
              </span>
              <input
                value={form.main_contact_name}
                onChange={(e) =>
                  setForm((row) => ({
                    ...row,
                    main_contact_name: e.target.value,
                  }))
                }
                className="compass-input"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                Role
              </span>
              <input
                value={form.main_contact_role}
                onChange={(e) =>
                  setForm((row) => ({
                    ...row,
                    main_contact_role: e.target.value,
                  }))
                }
                className="compass-input"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                Engagement type
              </span>
              <input
                value={form.engagement_type}
                onChange={(e) =>
                  setForm((row) => ({
                    ...row,
                    engagement_type: e.target.value,
                  }))
                }
                placeholder="Growth, AI build, mixed…"
                className="compass-input"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                Retainer status
              </span>
              <input
                value={form.retainer_status}
                onChange={(e) =>
                  setForm((row) => ({
                    ...row,
                    retainer_status: e.target.value,
                  }))
                }
                className="compass-input"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                Status
              </span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((row) => ({ ...row, status: e.target.value }))
                }
                className="compass-input"
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
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                Tags
              </span>
              <input
                value={form.tags}
                onChange={(e) =>
                  setForm((row) => ({ ...row, tags: e.target.value }))
                }
                placeholder="growth, ai-build, meta…"
                className="compass-input"
                disabled={saving}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="compass-btn-primary"
          >
            {saving ? 'Creating…' : 'Create client'}
          </button>
        </form>
      ) : null}

      {filtered.length === 0 ? (
        <div className="compass-panel px-8 py-12 text-center text-sm text-neutral-500">
          {clients.length === 0
            ? 'No clients yet. Add your first account to open a workspace.'
            : 'No clients match that search.'}
        </div>
      ) : (
        <div className="folio-client-directory">
          {filtered.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => openClient(client.id)}
              onMouseEnter={() => prefetchClient(client.id)}
              onFocus={() => prefetchClient(client.id)}
              className="folio-client-card"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-base font-semibold text-neutral-900">
                  {client.name}
                  {client.tags?.includes('cs-demo') ? (
                    <span className="ml-2 inline-flex rounded-md bg-amber-50 px-2 py-0.5 align-middle text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                      Demo
                    </span>
                  ) : null}
                </h3>
                <span className="shrink-0 rounded-md bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-neutral-600 ring-1 ring-inset ring-stone-200/80">
                  {clientStatusLabel(client.status)}
                </span>
              </div>
              <p className="mt-4 text-sm text-neutral-500">
                Last touch · {formatRelativeTouch(client.last_touch_at)}
              </p>
              <p className="mt-1 text-sm text-neutral-700">
                Next · {client.next_action || 'No next action recorded'}
              </p>
            </button>
          ))}
        </div>
      )}

      {selectedClientId ? (
        <ClientDetailModal
          clientId={selectedClientId}
          clientName={selectedClient?.name}
          onClose={closeClient}
          onArchived={() => {
            closeClient()
            void onRefresh()
          }}
          onChanged={onRefresh}
        />
      ) : null}
    </div>
  )
}
