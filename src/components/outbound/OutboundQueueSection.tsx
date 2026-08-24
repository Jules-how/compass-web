'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type {
  QueueCampaign,
  QueuePayload,
  QueueRecontactGroup,
  QueueWeekBucket
} from '@/lib/campaign-queue'

const WEEK_LABELS: Record<QueueWeekBucket, string> = {
  this_week: 'This week',
  next_week: 'Next week',
  later: 'Later',
  unscheduled: 'Unscheduled'
}

const WEEK_ORDER: QueueWeekBucket[] = ['this_week', 'next_week', 'later', 'unscheduled']

function mondayFromToday(weeks: number): string {
  const now = new Date()
  const day = now.getDay()
  const diff = (day === 0 ? -6 : 1 - day) + weeks * 7
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  return monday.toISOString().slice(0, 10)
}

function copyChip(status: string): { label: string; className: string } {
  if (status === 'live') return { label: 'copy live', className: 'bg-emerald-50 text-emerald-700' }
  if (status === 'ready') return { label: 'copy ready', className: 'bg-emerald-50 text-emerald-700' }
  if (status === 'draft') return { label: 'copy draft', className: 'bg-amber-50 text-amber-800' }
  return { label: 'no copy', className: 'bg-stone-100 text-neutral-500' }
}

export function OutboundQueueSection() {
  const [data, setData] = useState<QueuePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/campaigns/queue', { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`queue fetch failed (${res.status})`)
      setData((await res.json()) as QueuePayload)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const grouped = useMemo(() => {
    const buckets: Record<QueueWeekBucket, QueueCampaign[]> = {
      this_week: [],
      next_week: [],
      later: [],
      unscheduled: []
    }
    for (const c of data?.queue ?? []) buckets[c.week].push(c)
    for (const key of WEEK_ORDER) {
      buckets[key].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))
    }
    return buckets
  }, [data])

  async function patchCampaign(id: string, patch: Record<string, unknown>) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      })
      if (!res.ok) throw new Error(`update failed (${res.status})`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  function moveWeek(campaign: QueueCampaign, weeks: number) {
    void patchCampaign(campaign.id, { start_date: mondayFromToday(weeks) })
  }

  function nudge(campaign: QueueCampaign, dir: 1 | -1) {
    const lane = grouped[campaign.week]
    const idx = lane.findIndex((c) => c.id === campaign.id)
    const neighbor = lane[idx - dir]
    if (!neighbor) return
    void patchCampaign(campaign.id, { priority: neighbor.priority + dir })
  }

  async function promote(group: QueueRecontactGroup) {
    const key = `${group.vertical}|${group.city ?? ''}`
    setBusyId(key)
    setNotice(null)
    try {
      const res = await fetch('/api/campaigns/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'promote', vertical: group.vertical, city: group.city })
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        detail?: string
        assigned?: number
        campaign?: { id?: string; name?: string }
      }
      if (!res.ok) throw new Error(body.detail || body.error || `promote failed (${res.status})`)
      setNotice(
        `Queued “${body.campaign?.name ?? 'recontact campaign'}” with ${body.assigned ?? 0} leads.`
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Queue</CardTitle>
          <CardDescription>
            Week-level campaign plan, per-trade runway, and the 90-day recontact pool. Planning
            only — push and activate stay in the campaign workspace and Instantly.
          </CardDescription>
        </div>
        {loading ? (
          <span className="text-[11px] font-medium text-neutral-400">Loading…</span>
        ) : (
          <span className="rounded-xl bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
            {data?.queue.length ?? 0} planned
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        {notice ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {notice}
          </p>
        ) : null}

        {data && data.runway.length > 0 ? (
          <div>
            <h4 className="compass-section-label mb-2">Runway</h4>
            <div className="flex flex-wrap gap-2">
              {data.runway.map((r) => (
                <span
                  key={r.vertical}
                  className={cn(
                    'rounded-xl border px-2.5 py-1 text-[11px] font-medium',
                    r.wavesLeft < 2
                      ? 'border-rose-200 bg-rose-50 text-rose-800'
                      : 'border-stone-200 bg-white text-neutral-700'
                  )}
                  title={`${r.sendable} sendable uncontacted · ${r.recontactReady} past 90-day cooldown · ≈${r.wavesLeft} waves of ${data.waveSize}`}
                >
                  {r.vertical} · {r.sendable} sendable
                  {r.recontactReady > 0 ? ` · ${r.recontactReady} ready` : ''}
                  {r.wavesLeft < 2 ? ' · low' : ''}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {WEEK_ORDER.map((week) => {
          const lane = grouped[week]
          if (lane.length === 0) return null
          return (
            <div key={week}>
              <h4 className="compass-section-label mb-2">{WEEK_LABELS[week]}</h4>
              <div className="overflow-hidden rounded-xl border border-stone-200/80 bg-white">
                {lane.map((c, idx) => {
                  const chip = copyChip(c.copy_status)
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5',
                        idx > 0 && 'border-t border-stone-100'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/sales/pipeline/${c.id}`}
                          className="truncate text-[13px] font-semibold text-neutral-900 hover:underline"
                        >
                          {c.name}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
                          <span>
                            {c.cohort > 0 ? `${c.cohort} leads` : 'no cohort'}
                          </span>
                          <span className={cn('rounded-lg px-1.5 py-0.5 font-semibold', chip.className)}>
                            {chip.label}
                          </span>
                          <span
                            className={cn(
                              'rounded-lg px-1.5 py-0.5 font-semibold',
                              c.bound
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-stone-100 text-neutral-500'
                            )}
                          >
                            {c.bound ? 'instantly bound' : 'unbound'}
                          </span>
                          {[...c.vertical_tags, ...c.location_tags].map((tag) => (
                            <span key={tag} className="text-neutral-400">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busyId === c.id}
                          onClick={() => nudge(c, 1)}
                          aria-label="Move up"
                          className="rounded-lg px-1.5 py-1 text-[11px] text-neutral-500 hover:bg-stone-100"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={busyId === c.id}
                          onClick={() => nudge(c, -1)}
                          aria-label="Move down"
                          className="rounded-lg px-1.5 py-1 text-[11px] text-neutral-500 hover:bg-stone-100"
                        >
                          ↓
                        </button>
                        <select
                          value=""
                          disabled={busyId === c.id}
                          onChange={(e) => {
                            const v = e.target.value
                            if (v !== '') moveWeek(c, Number(v))
                          }}
                          aria-label="Move to week"
                          className="compass-input h-7 rounded-lg px-1.5 py-0 text-[11px]"
                        >
                          <option value="">Week…</option>
                          <option value="0">This week</option>
                          <option value="1">Next week</option>
                          <option value="2">In 2 weeks</option>
                          <option value="3">In 3 weeks</option>
                        </select>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {data && data.queue.length === 0 && !loading ? (
          <p className="text-sm text-neutral-500">No planned campaigns in the queue.</p>
        ) : null}

        {data && data.recontactPool.length > 0 ? (
          <div>
            <h4 className="compass-section-label mb-2">Ready to recontact</h4>
            <div className="overflow-hidden rounded-xl border border-stone-200/80 bg-white">
              {data.recontactPool.map((g, idx) => {
                const key = `${g.vertical}|${g.city ?? ''}`
                return (
                  <div
                    key={key}
                    className={cn(
                      'flex flex-wrap items-center gap-3 px-3 py-2.5',
                      idx > 0 && 'border-t border-stone-100'
                    )}
                  >
                    <div className="min-w-0 flex-1 text-[13px] text-neutral-900">
                      <span className="font-semibold">{g.vertical}</span>
                      {g.city ? <span className="text-neutral-500"> · {g.city}</span> : null}
                      <span className="ml-2 text-[11px] text-neutral-500">
                        {g.count} past 90-day cooldown
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={!g.promotable || busyId === key}
                      onClick={() => void promote(g)}
                      title={
                        g.promotable
                          ? 'Create a planned recontact campaign with these leads'
                          : `Thin cohort — needs ${data.promoteMin}+ ready leads`
                      }
                      className={cn(
                        'rounded-xl px-3 py-1.5 text-[12px] font-semibold shadow-soft',
                        g.promotable
                          ? 'bg-[#e85d2a] text-white'
                          : 'cursor-not-allowed bg-stone-100 text-neutral-400'
                      )}
                    >
                      {busyId === key ? 'Promoting…' : 'Promote'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
