'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CompassClientActivity,
  CompassClientAdSpend,
  CompassClientCard,
  CompassClientChannelNote,
  CompassClientIssue,
  CompassClientOffer,
  CompassClientUpdate,
  CompassMetaAd,
  CompassMetaAdSet,
  CompassMetaCampaign,
  CompassProjectWithStats,
  CompassTask
} from '@/lib/types'
import {
  CLIENT_ISSUE_STATUSES,
  CLIENT_PRIORITIES,
  CLIENT_STATUSES,
  clientIssueStatusLabel,
  clientStatusLabel,
  formatRelativeTouch,
  type ClientIssueStatus,
  type ClientStatus
} from '@/lib/client-pm'
import {
  PROJECT_HEALTHS,
  projectHealthLabel,
  projectPriorityLabel,
  type ProjectHealth
} from '@/lib/project-pm'
import { formatPercentComplete } from '@/lib/project-stats'
import { loadQueryCache, peekQueryCache } from '@/lib/query-cache'
import { LoadingBlock } from '@/components/LoadingBlock'
import { ClientChannelPanel } from '@/components/clients/ClientChannelPanel'
import { ClientCommsPanel } from '@/components/clients/ClientCommsPanel'
import { ClientWorkPlanner } from '@/components/clients/ClientWorkPlanner'
import { MetaAdsManagerPanel } from '@/components/clients/MetaAdsManagerPanel'
import { ClientDealTermsCard } from '@/components/clients/ClientDealTermsCard'
import { ClientInvoicesCard } from '@/components/clients/ClientInvoicesCard'
import { ClientOnboardingCard } from '@/components/clients/ClientOnboardingCard'
import { ClientVoicePanel } from '@/components/ClientVoicePanel'
import { ClientReactivationPanel } from '@/components/clients/ClientReactivationPanel'
import { ClientMetaAttachPanel } from '@/components/clients/ClientMetaAttachPanel'
import { ClientGoogleAttachPanel } from '@/components/clients/ClientGoogleAttachPanel'
import { CsClientHealth } from '@/components/cs-dept/CsClientHealth'

const clientDetailCacheKey = (id: string) => `/api/clients/${id}`

type TabKey = 'overview' | 'activity' | 'comms' | 'issues' | 'meta' | 'google' | 'projects'
type MetaSubView = 'ads_manager' | 'channel_log'

interface ClientDetailPayload {
  client: CompassClientCard
  updates: CompassClientUpdate[]
  activity: CompassClientActivity[]
  issues: CompassClientIssue[]
  offers: CompassClientOffer[]
  adSpend: CompassClientAdSpend[]
  channelNotes: CompassClientChannelNote[]
  metaCampaigns: CompassMetaCampaign[]
  metaAdSets: CompassMetaAdSet[]
  metaAds: CompassMetaAd[]
  projects: CompassProjectWithStats[]
  tasks: CompassTask[]
}

const ISSUE_GROUPS: ClientIssueStatus[] = [
  'in-progress',
  'not-started',
  'blocked',
  'completed',
  'cancelled'
]

function PriorityGlyph({ priority }: { priority: number }) {
  if (priority === 1) {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-orange-500 text-[10px] font-bold text-white"
        title="Urgent"
      >
        !
      </span>
    )
  }
  const filled = priority === 0 ? 0 : priority === 2 ? 3 : priority === 3 ? 2 : 1
  return (
    <span className="inline-flex h-4 w-3 flex-col justify-end gap-0.5" title={projectPriorityLabel(priority)}>
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={`block h-0.5 rounded-sm ${bar <= filled ? 'bg-neutral-700' : 'bg-neutral-300'}`}
        />
      ))}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  const tone =
    status === 'in-progress'
      ? 'border-amber-400 bg-amber-100'
      : status === 'completed'
        ? 'border-sky-500 bg-sky-500'
        : status === 'blocked'
          ? 'border-red-400 bg-red-100'
          : status === 'cancelled'
            ? 'border-neutral-400 bg-neutral-300'
            : 'border-neutral-300 bg-white'
  return <span className={`inline-block h-3 w-3 rounded-full border ${tone}`} />
}

interface ClientDetailPanelProps {
  clientId: string
  mode?: 'page' | 'modal'
  clientNameHint?: string
  onClose?: () => void
  onArchived?: () => void
  onChanged?: () => void | Promise<void>
}

export function ClientDetailPanel({
  clientId,
  mode = 'page',
  clientNameHint,
  onClose,
  onArchived,
  onChanged
}: ClientDetailPanelProps) {
  const [data, setData] = useState<ClientDetailPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('overview')
  const [metaSubView, setMetaSubView] = useState<MetaSubView>('ads_manager')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const isModal = mode === 'modal'

  const [editName, setEditName] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editStatus, setEditStatus] = useState<ClientStatus>('onboarding')
  const [editPriority, setEditPriority] = useState(0)
  const [editHealth, setEditHealth] = useState<ProjectHealth>('no_updates')
  const [editIndustry, setEditIndustry] = useState('')
  const [editWebsite, setEditWebsite] = useState('')
  const [editContact, setEditContact] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editEngagement, setEditEngagement] = useState('')
  const [editRetainer, setEditRetainer] = useState('')
  const [editTags, setEditTags] = useState('')
  const [updateBody, setUpdateBody] = useState('')
  const [updateHealth, setUpdateHealth] = useState<ProjectHealth>('on_track')

  const [issueTitle, setIssueTitle] = useState('')
  const [issuePriority, setIssuePriority] = useState(0)

  const applyPayload = useCallback((body: ClientDetailPayload) => {
    setData(body)
    setEditName(body.client.name)
    setEditSummary(body.client.summary ?? '')
    setEditNotes(body.client.notes ?? '')
    setEditStatus(body.client.status as ClientStatus)
    setEditPriority(body.client.priority ?? 0)
    setEditHealth((body.client.health as ProjectHealth) || 'no_updates')
    setEditIndustry(body.client.industry ?? '')
    setEditWebsite(body.client.website ?? '')
    setEditContact(body.client.main_contact_name ?? '')
    setEditRole(body.client.main_contact_role ?? '')
    setEditEngagement(body.client.engagement_type ?? '')
    setEditRetainer(body.client.retainer_status ?? '')
    setEditTags((body.client.tags ?? []).join(', '))
  }, [])

  const load = useCallback(
    async (force = false) => {
      setError(null)
      const cacheKey = clientDetailCacheKey(clientId)
      if (!force) {
        const cached = peekQueryCache<ClientDetailPayload>(cacheKey)
        if (cached?.data && !cached.error) applyPayload(cached.data)
      }
      try {
        const entry = await loadQueryCache<ClientDetailPayload>(
          cacheKey,
          async () => {
            const res = await fetch(`/api/clients/${clientId}`, {
              headers: { Accept: 'application/json' }
            })
            if (res.status === 404) throw new Error('Client not found')
            if (!res.ok) throw new Error(`Failed to load client (${res.status})`)
            return (await res.json()) as ClientDetailPayload
          },
          { force }
        )
        if (entry.error) throw new Error(entry.error)
        if (entry.data) applyPayload(entry.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [applyPayload, clientId]
  )

  useEffect(() => {
    setTab('overview')
    setMetaSubView('ads_manager')
    setSaveMessage(null)
    const cached = peekQueryCache<ClientDetailPayload>(clientDetailCacheKey(clientId))
    if (cached?.data && !cached.error) applyPayload(cached.data)
    else setData(null)
    void load(false)
  }, [applyPayload, clientId, load])

  const issuesByStatus = useMemo(() => {
    if (!data) return []
    return ISSUE_GROUPS.map((status) => ({
      status,
      label: clientIssueStatusLabel(status),
      items: data.issues.filter((issue) => issue.status === status)
    })).filter((group) => group.items.length > 0 || status === 'not-started' || status === 'in-progress')
  }, [data])

  const issueProgress = useMemo(() => {
    if (!data) return { total: 0, completed: 0, started: 0, percent: 0 }
    const total = data.issues.length
    const completed = data.issues.filter((issue) => issue.status === 'completed').length
    const started = data.issues.filter((issue) => issue.status === 'in-progress').length
    return {
      total,
      completed,
      started,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100)
    }
  }, [data])

  async function saveOverview(event: React.FormEvent) {
    event.preventDefault()
    if (!data) return
    setSaving(true)
    setSaveMessage(null)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          summary: editSummary.trim() || null,
          notes: editNotes.trim() || null,
          status: editStatus,
          priority: editPriority,
          health: editHealth,
          industry: editIndustry.trim() || null,
          website: editWebsite.trim() || null,
          main_contact_name: editContact.trim() || null,
          main_contact_role: editRole.trim() || null,
          engagement_type: editEngagement.trim() || null,
          retainer_status: editRetainer.trim() || null,
          tags: editTags
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      setSaveMessage('Saved')
      await load(true)
      await onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function postUpdate(event: React.FormEvent) {
    event.preventDefault()
    if (!updateBody.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          health: updateHealth,
          update: { body: updateBody.trim(), health: updateHealth }
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      setUpdateBody('')
      setTab('activity')
      await load(true)
      await onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function archiveClient() {
    if (!data) return
    if (!window.confirm(`Archive ${data.client.name}? History is kept.`)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      await onChanged?.()
      if (onArchived) onArchived()
      else if (onClose) onClose()
      else window.location.href = '/clients'
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  async function createIssue(event: React.FormEvent) {
    event.preventDefault()
    if (!issueTitle.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: issueTitle.trim(),
          priority: issuePriority,
          status: 'not-started'
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      setIssueTitle('')
      setIssuePriority(0)
      await load(true)
      await onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function patchIssue(issueId: string, patch: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/issues`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: issueId, ...patch })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      await load(true)
      await onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function deleteIssue(issueId: string) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/issues`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: issueId })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      await load(true)
      await onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const titleName = data?.client.name ?? clientNameHint ?? 'Client'

  if (error && !data) {
    return (
      <div className={`${isModal ? 'flex h-full flex-col' : ''}`}>
        {isModal ? (
          <div className="flex items-center justify-between border-b border-stone-200/80 bg-white px-5 py-4">
            <h2 id="client-detail-title" className="font-display text-lg font-semibold text-neutral-900">
              {titleName}
            </h2>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-stone-200 px-2.5 py-1.5 text-xs text-neutral-600 transition hover:bg-stone-50"
              >
                Close
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 m-5">
          {error}{' '}
          {isModal && onClose ? (
            <button type="button" className="underline" onClick={onClose}>
              Close
            </button>
          ) : (
            <Link href="/clients" className="underline">
              Back to clients
            </Link>
          )}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={`${isModal ? 'flex h-full flex-col' : ''}`}>
        {isModal ? (
          <div className="flex items-center justify-between border-b border-stone-200/80 bg-white px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                Client
              </p>
              <h2 id="client-detail-title" className="font-display text-lg font-semibold text-neutral-900">
                {titleName}
              </h2>
            </div>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-stone-200 px-2.5 py-1.5 text-xs text-neutral-600 transition hover:bg-stone-50"
              >
                Close
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={isModal ? 'flex flex-1 items-center justify-center p-8' : ''}>
          <LoadingBlock label="Loading client…" />
        </div>
      </div>
    )
  }

  const { client, updates, activity } = data
  const tabs: Array<[TabKey, string]> = [
    ['overview', 'Overview'],
    ['activity', `Activity (${activity.length})`],
    ['comms', 'Comms'],
    ['issues', `Issues (${data.issues.length})`],
    ['meta', 'Meta'],
    ['google', 'Google'],
    ['projects', `Projects (${data.projects.length})`]
  ]

  const refresh = () => load(true)

  return (
    <div className={isModal ? 'flex h-full min-h-0 flex-col' : 'space-y-5'}>
      <div
        className={
          isModal
            ? 'shrink-0 space-y-3 border-b border-stone-200/80 bg-white px-5 py-4'
            : 'flex flex-wrap items-center justify-between gap-3'
        }
      >
        {isModal ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                Client
              </p>
              <h2
                id="client-detail-title"
                className="truncate font-display text-lg font-semibold text-neutral-900"
              >
                {client.name}
              </h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                {clientStatusLabel(client.status)}
                {client.next_action ? ` · Next: ${client.next_action}` : ''}
              </p>
            </div>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-xl border border-stone-200 px-2.5 py-1.5 text-xs text-neutral-600 transition hover:bg-stone-50"
              >
                Close
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Link href="/clients" className="hover:text-neutral-800">
              Clients
            </Link>
            <span>/</span>
            <span className="font-medium text-neutral-800">{client.name}</span>
          </div>
        )}
        <div className="compass-seg text-sm">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`compass-seg-btn ${tab === key ? 'compass-seg-btn-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={isModal ? 'min-h-0 flex-1 space-y-5 overflow-y-auto p-5' : 'contents'}>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {tab === 'overview' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="compass-panel space-y-5 p-5">
            <form onSubmit={saveOverview} className="space-y-4">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 font-display text-xl font-semibold"
                disabled={saving}
              />
              <input
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                placeholder="Profile summary — the relationship at a glance"
                className="compass-input"
                disabled={saving}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-neutral-500">Industry</span>
                  <input
                    value={editIndustry}
                    onChange={(e) => setEditIndustry(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-2 py-1.5"
                    disabled={saving}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-neutral-500">Website</span>
                  <input
                    value={editWebsite}
                    onChange={(e) => setEditWebsite(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-2 py-1.5"
                    disabled={saving}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-neutral-500">Main contact</span>
                  <input
                    value={editContact}
                    onChange={(e) => setEditContact(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-2 py-1.5"
                    disabled={saving}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-neutral-500">Role</span>
                  <input
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-2 py-1.5"
                    disabled={saving}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-neutral-500">Engagement type</span>
                  <input
                    value={editEngagement}
                    onChange={(e) => setEditEngagement(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-2 py-1.5"
                    disabled={saving}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-neutral-500">Retainer status</span>
                  <input
                    value={editRetainer}
                    onChange={(e) => setEditRetainer(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-2 py-1.5"
                    disabled={saving}
                  />
                </label>
              </div>

              <label className="block text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Tags</span>
                <input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="growth, ai-build…"
                  className="w-full rounded-lg border border-neutral-300 px-2 py-1.5"
                  disabled={saving}
                />
              </label>

              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={6}
                placeholder="Notes, context, and working agreements…"
                className="compass-input"
                disabled={saving}
              />

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={saving || !editName.trim()}
                  className="compass-btn-primary"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                {saveMessage ? <span className="text-sm text-emerald-600">{saveMessage}</span> : null}
                <button
                  type="button"
                  onClick={() => void archiveClient()}
                  disabled={saving}
                  className="ml-auto text-sm text-red-600 hover:underline disabled:opacity-60"
                >
                  Archive client
                </button>
              </div>
            </form>

            <form
              onSubmit={postUpdate}
              className="rounded-xl border border-violet-200/70 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg bg-stone-100 p-0.5 text-xs font-medium">
                  <span className="rounded-md px-2.5 py-1 text-neutral-400">Comment</span>
                  <span className="rounded-md bg-white px-2.5 py-1 text-neutral-800 shadow-sm">
                    Update
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  {projectHealthLabel(updateHealth)}
                </span>
              </div>
              <textarea
                value={updateBody}
                onChange={(e) => setUpdateBody(e.target.value)}
                rows={4}
                placeholder="Write an update…"
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                disabled={saving}
              />
              <div className="mt-3 border-l-2 border-stone-200 pl-3 text-xs text-neutral-500">
                <div>Next action: {client.next_action || 'No open issues'}</div>
                <div>Last touch: {formatRelativeTouch(client.last_touch_at)}</div>
                <div>
                  Progress: {issueProgress.completed}% complete · {issueProgress.started} started ·{' '}
                  {issueProgress.total} scoped
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <select
                  value={updateHealth}
                  onChange={(e) => setUpdateHealth(e.target.value as ProjectHealth)}
                  className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                  disabled={saving}
                >
                  {PROJECT_HEALTHS.map((health) => (
                    <option key={health} value={health}>
                      {projectHealthLabel(health)}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={saving || !updateBody.trim()}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-stone-50 disabled:opacity-60"
                >
                  Post update
                </button>
              </div>
            </form>
          </section>

          <aside className="compass-panel space-y-4 p-4">
            <CsClientHealth clientId={client.id} />
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                Progress
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full bg-sf-orange"
                    style={{ width: `${issueProgress.percent}%` }}
                  />
                </div>
                <span className="text-sm tabular-nums text-neutral-700">
                  {formatPercentComplete(issueProgress.percent)}
                </span>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                Scope {issueProgress.total} · Started {issueProgress.started} · Completed{' '}
                {issueProgress.completed}
              </p>
            </div>

            <div className="space-y-2 border-t border-stone-100 pt-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                Properties
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Status</span>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as ClientStatus)}
                  className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                  disabled={saving}
                >
                  {CLIENT_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {clientStatusLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Priority</span>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(Number(e.target.value))}
                  className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                  disabled={saving}
                >
                  {CLIENT_PRIORITIES.map((row) => (
                    <option key={row.value} value={row.value}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Health</span>
                <select
                  value={editHealth}
                  onChange={(e) => setEditHealth(e.target.value as ProjectHealth)}
                  className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                  disabled={saving}
                >
                  {PROJECT_HEALTHS.map((health) => (
                    <option key={health} value={health}>
                      {projectHealthLabel(health)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-2 border-t border-stone-100 pt-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  Recent comms
                </div>
                <button
                  type="button"
                  onClick={() => setTab('comms')}
                  className="text-xs text-sf-orange-dark"
                >
                  Open
                </button>
              </div>
              <p className="text-xs leading-relaxed text-neutral-600">
                {client.comms_summary?.trim() ||
                  'Link email or SMS threads on the Comms tab to gather context automatically.'}
              </p>
              {client.comms_summary_at ? (
                <p className="text-[11px] text-neutral-400">
                  Updated {formatRelativeTouch(client.comms_summary_at)}
                  {client.comms_summary_source ? ` · ${client.comms_summary_source}` : ''}
                </p>
              ) : null}
            </div>

            <div className="space-y-2 border-t border-stone-100 pt-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  Activity
                </div>
                <button
                  type="button"
                  onClick={() => setTab('activity')}
                  className="text-xs text-sf-orange-dark"
                >
                  See all
                </button>
              </div>
              <ul className="space-y-2">
                {activity.slice(0, 5).map((row) => (
                  <li key={row.id} className="text-xs text-neutral-600">
                    <span className="font-medium text-neutral-800">{row.actor}</span> {row.action.replace(/_/g, ' ')}
                    <div className="text-neutral-400">{formatRelativeTouch(row.created_at)}</div>
                  </li>
                ))}
                {activity.length === 0 ? (
                  <li className="text-xs text-neutral-500">No activity yet.</li>
                ) : null}
              </ul>
            </div>
          </aside>
        </div>
      ) : null}

      {tab === 'overview' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ClientOnboardingCard clientId={clientId} />
          <ClientDealTermsCard clientId={clientId} />
          <ClientInvoicesCard clientId={clientId} />
          <ClientVoicePanel clientId={clientId} />
          <ClientReactivationPanel clientId={clientId} />
          <ClientMetaAttachPanel clientId={clientId} />
          <ClientGoogleAttachPanel clientId={clientId} />
        </div>
      ) : null}

      {tab === 'overview' ? (
        <ClientWorkPlanner
          clientId={clientId}
          projects={data.projects}
          tasks={data.tasks ?? []}
          onRefresh={refresh}
        />
      ) : null}

      {tab === 'activity' ? (
        <section className="compass-panel space-y-4 p-5">
          <h2 className="font-display text-lg font-semibold">Activity</h2>
          {updates.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-neutral-700">Updates</h3>
              {updates.map((update) => (
                <article key={update.id} className="rounded-lg border border-stone-200 p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs text-neutral-500">
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 font-medium text-neutral-700">
                      {projectHealthLabel(update.health)}
                    </span>
                    <span>{formatRelativeTouch(update.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-neutral-800">{update.body}</p>
                </article>
              ))}
            </div>
          ) : null}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-neutral-700">Timeline</h3>
            {activity.length === 0 ? (
              <p className="text-sm text-neutral-500">No activity recorded yet.</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {activity.map((row) => (
                  <li key={row.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                    <div>
                      <div className="font-medium text-neutral-800">
                        {row.actor} · {row.action.replace(/_/g, ' ')}
                      </div>
                      <div className="text-neutral-600">{row.body}</div>
                    </div>
                    <div className="shrink-0 text-xs text-neutral-400">
                      {formatRelativeTouch(row.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {tab === 'comms' ? (
        <ClientCommsPanel
          clientId={clientId}
          initialSummary={client.comms_summary}
          initialSummaryAt={client.comms_summary_at}
          saving={saving}
          onBusy={setSaving}
          onError={setError}
          onClientRefresh={refresh}
        />
      ) : null}

      {tab === 'issues' ? (
        <section className="space-y-4">
          <form onSubmit={createIssue} className="compass-panel flex flex-wrap items-end gap-2 p-4">
            <label className="min-w-[220px] flex-1 text-sm">
              <span className="mb-1 block text-xs text-neutral-500">New issue</span>
              <input
                value={issueTitle}
                onChange={(e) => setIssueTitle(e.target.value)}
                placeholder="What needs doing?"
                className="compass-input"
                disabled={saving}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Priority</span>
              <select
                value={issuePriority}
                onChange={(e) => setIssuePriority(Number(e.target.value))}
                className="rounded-lg border border-neutral-300 px-2 py-2"
                disabled={saving}
              >
                {CLIENT_PRIORITIES.map((row) => (
                  <option key={row.value} value={row.value}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={saving || !issueTitle.trim()}
              className="compass-btn-primary"
            >
              Add issue
            </button>
          </form>

          <div className="compass-panel overflow-hidden">
            {issuesByStatus.map((group) => (
              <div key={group.status} className="border-b border-stone-100 last:border-b-0">
                <div className="flex items-center gap-2 bg-stone-50 px-4 py-2 text-sm font-medium text-neutral-700">
                  <StatusDot status={group.status} />
                  <span>{group.label}</span>
                  <span className="text-neutral-400">{group.items.length}</span>
                </div>
                {group.items.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-neutral-400">No issues</p>
                ) : (
                  <ul>
                    {group.items.map((issue) => (
                      <li
                        key={issue.id}
                        className="flex flex-wrap items-center gap-3 border-t border-stone-50 px-4 py-2.5 text-sm hover:bg-sky-50/40"
                      >
                        <PriorityGlyph priority={issue.priority} />
                        <StatusDot status={issue.status} />
                        <span className="min-w-0 flex-1 font-medium text-neutral-900">{issue.title}</span>
                        <select
                          value={issue.status}
                          onChange={(e) => void patchIssue(issue.id, { status: e.target.value })}
                          className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs"
                          disabled={saving}
                        >
                          {CLIENT_ISSUE_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {clientIssueStatusLabel(status)}
                            </option>
                          ))}
                        </select>
                        <select
                          value={issue.priority}
                          onChange={(e) =>
                            void patchIssue(issue.id, { priority: Number(e.target.value) })
                          }
                          className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs"
                          disabled={saving}
                        >
                          {CLIENT_PRIORITIES.map((row) => (
                            <option key={row.value} value={row.value}>
                              {row.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void deleteIssue(issue.id)}
                          className="text-xs text-red-600"
                          disabled={saving}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === 'meta' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="compass-seg">
              <button
                type="button"
                onClick={() => setMetaSubView('ads_manager')}
                className={`compass-seg-btn ${
                  metaSubView === 'ads_manager' ? 'compass-seg-btn-active' : ''
                }`}
              >
                Ads Manager
              </button>
              <button
                type="button"
                onClick={() => setMetaSubView('channel_log')}
                className={`compass-seg-btn ${
                  metaSubView === 'channel_log' ? 'compass-seg-btn-active' : ''
                }`}
              >
                Channel log
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              Build Campaign → Ad set → Ad drafts that match Meta upload fields.
            </p>
          </div>

          {metaSubView === 'ads_manager' ? (
            <MetaAdsManagerPanel
              clientId={clientId}
              campaigns={data.metaCampaigns ?? []}
              adSets={data.metaAdSets ?? []}
              ads={data.metaAds ?? []}
              saving={saving}
              onBusy={setSaving}
              onError={setError}
              onRefresh={refresh}
            />
          ) : (
            <ClientChannelPanel
              clientId={clientId}
              channel="meta"
              offers={data.offers}
              adSpend={data.adSpend}
              notes={data.channelNotes}
              saving={saving}
              onBusy={setSaving}
              onError={setError}
              onRefresh={refresh}
            />
          )}
        </div>
      ) : null}

      {tab === 'google' ? (
        <ClientChannelPanel
          clientId={clientId}
          channel="google"
          offers={data.offers}
          adSpend={data.adSpend}
          notes={data.channelNotes}
          saving={saving}
          onBusy={setSaving}
          onError={setError}
          onRefresh={refresh}
        />
      ) : null}

      {tab === 'projects' ? (
        <ClientWorkPlanner
          clientId={clientId}
          projects={data.projects}
          tasks={data.tasks ?? []}
          onRefresh={refresh}
          compact
        />
      ) : null}
      </div>
    </div>
  )
}
