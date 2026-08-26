'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { CsArtifact, CsBoard, CsCard, CsRoiProjection } from '@/lib/cs-dept/types'

type BoardPayload = CsBoard & { roi?: Array<CsRoiProjection | null> }

type TabKey = 'review' | 'roi' | 'qbr'

function money(value: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(
    value
  )
}

function bandBadge(band: string) {
  if (band === 'at_risk') return <Badge variant="destructive" appearance="light" size="sm">At risk</Badge>
  if (band === 'watch') return <Badge variant="warning" appearance="light" size="sm">Watch</Badge>
  return <Badge variant="success" appearance="light" size="sm">Healthy</Badge>
}

function attentionLabel(value: string) {
  switch (value) {
    case 'at_risk':
      return 'Save play'
    case 'guarantee_short':
      return 'Day 25 short'
    case 'guarantee':
      return 'Day 25 covered'
    case 'qbr':
      return 'QBR'
    default:
      return 'Weekly note'
  }
}

export function CsDeptBoard() {
  const [data, setData] = useState<BoardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('review')
  const [running, setRunning] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const res = await fetch('/api/cs', { cache: 'no-store' })
    const body = (await res.json().catch(() => ({}))) as BoardPayload & { error?: string }
    if (!res.ok) throw new Error(body.error || `Failed to load CS (${res.status})`)
    setData(body)
  }, [])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [load])

  async function runWeek() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/cs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const body = (await res.json().catch(() => ({}))) as BoardPayload & { error?: string }
      if (!res.ok) throw new Error(body.error || 'Run failed')
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  async function patchArtifact(id: string, status: 'approved' | 'skipped') {
    setBusyId(id)
    try {
      await fetch(`/api/cs/artifacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      setData((prev) => {
        if (!prev) return prev
        const artifacts = prev.artifacts.map((row) => (row.id === id ? { ...row, status } : row))
        const cards = prev.cards.map((card) => ({
          ...card,
          artifacts: card.artifacts.map((row) => (row.id === id ? { ...row, status } : row))
        }))
        return { ...prev, artifacts, cards }
      })
    } finally {
      setBusyId(null)
    }
  }

  async function approveHealthy() {
    if (!data) return
    const ids = data.cards
      .filter((card) => card.attention === 'healthy')
      .flatMap((card) => card.artifacts.filter((row) => row.status === 'draft').map((row) => row.id))
    for (const id of ids) {
      await patchArtifact(id, 'approved')
    }
  }

  const grouped = useMemo(() => {
    const cards = data?.cards ?? []
    return {
      focus: cards.filter((card) => card.attention !== 'healthy'),
      healthy: cards.filter((card) => card.attention === 'healthy')
    }
  }, [data])

  if (error && !data) {
    return <div className="compass-panel p-6 text-sm text-red-600">{error}</div>
  }

  if (!data) {
    return <div className="compass-panel p-6 text-sm text-neutral-500">Loading retention…</div>
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="Clients" value={String(data.counts.clients)} hint={data.source === 'demo' ? 'Demo seed' : data.source} />
        <Kpi label="At risk" value={String(data.counts.at_risk)} hint="Save play drafted" />
        <Kpi label="Drafts" value={String(data.counts.drafts)} hint="Approve or skip" />
        <Kpi label="Monday budget" value="30 min" hint={`${data.counts.healthy} healthy to scan`} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl border border-stone-200 bg-white p-0.5 text-sm">
          {(['review', 'roi', 'qbr'] as TabKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                tab === key ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              {key === 'review' ? 'Monday review' : key === 'roi' ? 'ROI portal' : 'QBR'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {tab === 'review' && grouped.healthy.length > 0 ? (
            <button type="button" className="compass-btn-secondary" onClick={() => void approveHealthy()}>
              Approve healthy
            </button>
          ) : null}
          <button type="button" className="compass-btn-primary" onClick={() => void runWeek()} disabled={running}>
            {running ? 'Running…' : 'Run this week'}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {tab === 'review' ? (
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">
            Open the red and amber cards. Healthy clients stay one line. Goal: drafts reviewed in 30 minutes at 50
            clients.
          </p>
          {grouped.focus.map((card) => (
            <ClientReviewCard
              key={card.client.id}
              card={card}
              open={openId === card.client.id}
              busyId={busyId}
              onToggle={() => setOpenId((id) => (id === card.client.id ? null : card.client.id))}
              onPatch={patchArtifact}
            />
          ))}
          {grouped.healthy.length > 0 ? (
            <section className="compass-panel space-y-2 p-5">
              <div className="compass-section-label">Healthy · scan only</div>
              {grouped.healthy.map((card) => (
                <HealthyRow key={card.client.id} card={card} onPatch={patchArtifact} />
              ))}
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === 'roi' ? <RoiPanel artifacts={data.artifacts} /> : null}
      {tab === 'qbr' ? <QbrPanel artifacts={data.artifacts} /> : null}
    </div>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="compass-panel p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-neutral-900">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{hint}</p>
    </div>
  )
}

function ClientReviewCard({
  card,
  open,
  busyId,
  onToggle,
  onPatch
}: {
  card: CsCard
  open: boolean
  busyId: string | null
  onToggle: () => void
  onPatch: (id: string, status: 'approved' | 'skipped') => Promise<void>
}) {
  const weekly = card.artifacts.find((row) => row.kind === 'weekly_summary')
  const recovered = Number(weekly?.payload?.recovered_this) || 0
  return (
    <article className="compass-panel overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full items-start justify-between gap-4 p-5 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-neutral-900">{card.client.name}</h2>
            {bandBadge(card.snapshot.band)}
            <Badge variant="secondary" appearance="light" size="sm">
              {attentionLabel(card.attention)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {card.client.city} {card.client.trade ? `· ${card.client.trade}` : ''} · score{' '}
            <span className="tabular-nums text-neutral-800">{card.snapshot.score}</span>
            {card.snapshot.drop_points > 0 ? ` · down ${card.snapshot.drop_points}` : ''} · {money(recovered)} this week
          </p>
        </div>
        <span className="text-xs text-neutral-400">{open ? 'Hide' : 'Open'}</span>
      </button>
      {open ? (
        <div className="space-y-4 border-t border-stone-100 px-5 pb-5 pt-4">
          <FactorRow card={card} />
          {card.artifacts.map((artifact) => (
            <DraftBlock key={artifact.id} artifact={artifact} busy={busyId === artifact.id} onPatch={onPatch} />
          ))}
          <Link href={`/clients/${card.client.id}`} className="text-xs font-medium text-[#c2410c] hover:underline">
            Open client
          </Link>
        </div>
      ) : null}
    </article>
  )
}

function HealthyRow({
  card,
  onPatch
}: {
  card: CsCard
  onPatch: (id: string, status: 'approved' | 'skipped') => Promise<void>
}) {
  const weekly = card.artifacts.find((row) => row.kind === 'weekly_summary')
  const sms = card.artifacts.find((row) => row.kind === 'monday_sms')
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200/80 px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium text-neutral-900">
          {card.client.name}{' '}
          <span className="tabular-nums text-neutral-500">{card.snapshot.score}</span>
        </p>
        <p className="truncate text-xs text-neutral-500">{sms?.body || weekly?.body}</p>
      </div>
      {sms && sms.status === 'draft' ? (
        <button type="button" className="compass-btn-secondary" onClick={() => void onPatch(sms.id, 'approved')}>
          Approve
        </button>
      ) : (
        <span className="text-xs text-emerald-700">Approved</span>
      )}
    </div>
  )
}

function FactorRow({ card }: { card: CsCard }) {
  const factors = card.snapshot.factors
  const items = [
    ['Calls', factors.call_volume?.points],
    ['Booked', factors.booked_showed?.points],
    ['Owner', factors.owner_engaged?.points],
    ['Pay', factors.payment?.points],
    ['Support', factors.support?.points]
  ] as const
  return (
    <div className="grid grid-cols-5 gap-2">
      {items.map(([label, points]) => (
        <div key={label} className="rounded-xl border border-stone-200/80 px-2 py-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
          <p className="tabular-nums text-sm font-semibold text-neutral-800">{points ?? 0}/20</p>
        </div>
      ))}
    </div>
  )
}

function DraftBlock({
  artifact,
  busy,
  onPatch
}: {
  artifact: CsArtifact
  busy: boolean
  onPatch: (id: string, status: 'approved' | 'skipped') => Promise<void>
}) {
  return (
    <div className="rounded-xl border border-stone-200/80 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-900">{artifact.title}</p>
        <span className="text-[11px] uppercase tracking-wide text-neutral-400">{artifact.status}</span>
      </div>
      <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-neutral-700">{artifact.body}</pre>
      {artifact.status === 'draft' ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="compass-btn-primary"
            disabled={busy}
            onClick={() => void onPatch(artifact.id, 'approved')}
          >
            Approve
          </button>
          <button
            type="button"
            className="compass-btn-secondary"
            disabled={busy}
            onClick={() => void onPatch(artifact.id, 'skipped')}
          >
            Skip
          </button>
        </div>
      ) : null}
    </div>
  )
}

function RoiPanel({ artifacts }: { artifacts: CsArtifact[] }) {
  const rows = artifacts.filter((row) => row.kind === 'weekly_summary')
  if (rows.length === 0) {
    return <div className="compass-panel p-6 text-sm text-neutral-500">No weekly results yet.</div>
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map((row) => {
        const p = row.payload
        return (
          <article key={row.id} className="compass-panel space-y-3 p-5">
            <div>
              <p className="compass-section-label">This week</p>
              <h2 className="font-display text-lg font-semibold text-neutral-900">{row.client_name}</h2>
              <p className="text-xs text-neutral-500">
                {String(p.period_start || '')} to {String(p.period_end || '')}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-neutral-400">Calls</dt>
                <dd className="tabular-nums font-semibold">{String(p.calls_this ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-neutral-400">Booked</dt>
                <dd className="tabular-nums font-semibold">{String(p.booked_this ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-neutral-400">Showed</dt>
                <dd className="tabular-nums font-semibold">{String(p.showed_this ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-neutral-400">Recovered</dt>
                <dd className="tabular-nums font-semibold">{money(Number(p.recovered_this) || 0)}</dd>
              </div>
            </dl>
            <p className="text-xs text-neutral-500">
              Week before: {String(p.calls_last ?? 0)} calls, {String(p.booked_last ?? 0)} booked,{' '}
              {String(p.showed_last ?? 0)} showed.
            </p>
            <p className="text-xs text-neutral-400">Customer view. No health score. No save play.</p>
          </article>
        )
      })}
    </div>
  )
}

function QbrPanel({ artifacts }: { artifacts: CsArtifact[] }) {
  const rows = artifacts.filter((row) => row.kind === 'qbr')
  if (rows.length === 0) {
    return <div className="compass-panel p-6 text-sm text-neutral-500">No QBR this week.</div>
  }
  return (
    <div className="grid gap-4">
      {rows.map((row) => (
        <article key={row.id} className="compass-panel space-y-3 p-6">
          <h2 className="font-display text-xl font-semibold text-neutral-900">{row.title}</h2>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-neutral-700">{row.body}</pre>
        </article>
      ))}
    </div>
  )
}
