'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { InstallSopGraph } from './InstallSopGraph'
import type { SopPlan } from '@/lib/delivery-dept/sop-template'

type BoardCard = {
  id: string
  source: string
  business: string
  ownerName: string
  city: string
  trade: string
  packId: string | null
  column: string
  columnTitle: string
  stepTitle: string
  stepOwner: string
  blockedOn: string | null
  sla: { status: string; overdue: boolean }
  slaLabel: string
  julesMinutesLeft: number
  sms: string
  currentCheckpoint: string | null
  notes: string
  clientId: string | null
  publishedNumber: string
  carrier: string | null
  lineType: string | null
  numberStrategy: { notes?: string; packLabel?: string } | null
  testCall: { runner?: string; note?: string; passed?: boolean } | null
  steps: Record<string, { status: string; owner: string; blockedOn: string | null }>
  sopPlan?: SopPlan
}

type BoardPayload = {
  now: string
  pipeline: {
    columns: string[]
    steps: Array<{ id: string; title: string; column: string; owner: string }>
    checkpointMeta: Record<string, { label: string }>
  }
  sopTemplate?: SopPlan
  columns: Array<{ id: string; title: string; owner: string; cards: BoardCard[] }>
  capacity: {
    liveActive: number
    demoActive: number
    cap: number
    remaining: number
    full: boolean
    julesMinutes: number
    julesHoursCap: number
  }
}

function ownerChip(owner: string) {
  if (owner === 'jules') {
    return (
      <Badge variant="primary" appearance="light" size="sm">
        You
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" appearance="light" size="sm">
      Auto
    </Badge>
  )
}

function slaChip(card: BoardCard) {
  if (card.blockedOn) {
    return (
      <Badge variant="warning" appearance="light" size="sm">
        Blocked on {card.blockedOn}
      </Badge>
    )
  }
  if (card.sla.overdue) {
    return (
      <Badge variant="destructive" appearance="light" size="sm">
        {card.slaLabel}
      </Badge>
    )
  }
  if (card.sla.status === 'due_soon') {
    return (
      <Badge variant="warning" appearance="light" size="sm">
        {card.slaLabel}
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" appearance="light" size="sm">
      {card.slaLabel}
    </Badge>
  )
}

export function InstallKanban() {
  const [board, setBoard] = useState<BoardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [labNote, setLabNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const res = await fetch('/api/delivery-dept/installs?source=all', { cache: 'no-store' })
    const body = (await res.json()) as BoardPayload & { error?: string }
    if (!res.ok) throw new Error(body.error || `Failed (${res.status})`)
    setBoard(body)
  }, [])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [load])

  const selected = board?.columns.flatMap((col) => col.cards).find((card) => card.id === openId) || null

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    setBusy(true)
    setLabNote(null)
    try {
      const res = await fetch(`/api/delivery-dept/installs/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra })
      })
      const body = (await res.json()) as { error?: string; lab?: { note?: string } }
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`)
      if (body.lab?.note) setLabNote(body.lab.note)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function copySms(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  if (error && !board) {
    return <div className="compass-panel p-6 text-sm text-red-600">{error}</div>
  }
  if (!board) {
    return <div className="compass-panel p-6 text-sm text-neutral-500">Loading installs…</div>
  }

  const cap = board.capacity

  return (
    <div className="space-y-5">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <InstallSopGraph
        board={board}
        selectedInstallId={openId}
        onSelectInstall={setOpenId}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Voice setup capacity</CardTitle>
              <CardDescription>Legacy voice setup queue only.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">
              {cap.liveActive}
              <span className="text-base font-medium text-neutral-500"> / {cap.cap}</span>
            </p>
            <p className="mt-2 text-sm text-neutral-500">
              {cap.full ? 'Configured capacity is full.' : `${cap.remaining} slots open.`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Jules time left</CardTitle>
              <CardDescription>Current voice setup work only.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">{cap.julesMinutes} min</p>
            <p className="mt-2 text-sm text-neutral-500">Remaining work on current live pipelines.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Demo</CardTitle>
              <CardDescription>Legacy voice setup examples.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex items-end justify-between gap-3">
            <p className="text-sm text-neutral-600">{cap.demoActive} demo cards on the board.</p>
            <button
              type="button"
              className="compass-btn-secondary"
              disabled={busy}
              onClick={() => void act('demo-harbour-gas', 'reset_demo')}
            >
              Reset demo
            </button>
          </CardContent>
        </Card>
      </div>

      <div>
        <p className="compass-section-label">Existing install queue</p>
        <p className="mt-1 text-sm text-neutral-500">
          These cards run the legacy voice setup actions. The configurable delivery SOP is above.
        </p>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-4">
          {board.columns.map((col) => (
            <section key={col.id} className="w-[260px] shrink-0">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="compass-section-label">{col.title}</p>
                  <p className="text-xs text-neutral-500">{col.owner === 'jules' ? 'You' : 'Automated'}</p>
                </div>
                <span className="rounded-lg bg-stone-100 px-2 py-0.5 text-xs text-neutral-600">{col.cards.length}</span>
              </div>
              <div className="space-y-3">
                {col.cards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setOpenId(card.id)}
                    className={cn(
                      'w-full rounded-2xl border border-stone-200/70 bg-white p-4 text-left shadow-soft transition',
                      openId === card.id ? 'border-[#e85d2a]/40' : 'hover:border-stone-300'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-neutral-900">{card.business}</p>
                      {card.source === 'demo' ? (
                        <Badge variant="outline" size="xs">
                          Demo
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      {card.city}
                      {card.city && card.trade ? ' · ' : ''}
                      {card.trade}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {ownerChip(card.stepOwner)}
                      {slaChip(card)}
                    </div>
                    <p className="mt-3 text-xs text-neutral-500">{card.julesMinutesLeft} min left on this install</p>
                  </button>
                ))}
                {col.cards.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-8 text-center text-xs text-neutral-400">
                    Empty
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </div>

      {selected ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{selected.business}</CardTitle>
              <CardDescription>
                {selected.ownerName}
                {selected.city ? ` · ${selected.city}` : ''}
                {selected.publishedNumber ? ` · ${selected.publishedNumber}` : ''}
              </CardDescription>
            </div>
            <button type="button" className="compass-btn-ghost" onClick={() => setOpenId(null)}>
              Close
            </button>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <p className="compass-section-label">Legacy voice steps</p>
              <ol className="space-y-2">
                {board.pipeline.steps.map((step) => {
                  const state = selected.steps[step.id]
                  return (
                    <li
                      key={step.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-stone-100 px-3 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-medium text-neutral-800">{step.title}</p>
                        <p className="text-xs text-neutral-500">
                          {state?.status || 'pending'}
                          {state?.blockedOn ? ` · blocked on ${state.blockedOn}` : ''}
                        </p>
                      </div>
                      {ownerChip(step.owner)}
                    </li>
                  )
                })}
              </ol>
              {selected.numberStrategy?.notes ? (
                <p className="rounded-xl bg-stone-50 px-4 py-3 text-sm text-neutral-600">{selected.numberStrategy.notes}</p>
              ) : null}
              {selected.notes ? <p className="text-sm text-neutral-500">{selected.notes}</p> : null}
              {labNote ? <p className="text-sm text-neutral-600">{labNote}</p> : null}
              {selected.testCall?.note ? <p className="text-sm text-neutral-500">{selected.testCall.note}</p> : null}
            </div>

            <div className="space-y-4">
              <p className="compass-section-label">Client SMS</p>
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm leading-6 text-neutral-700">
                {selected.sms}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="compass-btn-primary" onClick={() => void copySms(selected.sms)}>
                  {copied ? 'Copied' : 'Copy SMS'}
                </button>
                {selected.column === 'number_strategy' ? (
                  <button
                    type="button"
                    className="compass-btn-secondary"
                    disabled={busy}
                    onClick={() => void act(selected.id, 'choose_strategy')}
                  >
                    Confirm number plan
                  </button>
                ) : null}
                {selected.column === 'retell_agent' ? (
                  <button
                    type="button"
                    className="compass-btn-secondary"
                    disabled={busy}
                    onClick={() => void act(selected.id, 'provision')}
                  >
                    Generate agent
                  </button>
                ) : null}
                {selected.column === 'calendar_grant' ? (
                  <button
                    type="button"
                    className="compass-btn-secondary"
                    disabled={busy}
                    onClick={() => void act(selected.id, 'probe')}
                  >
                    Probe calendar
                  </button>
                ) : null}
                {selected.column === 'test_call' ? (
                  <button
                    type="button"
                    className="compass-btn-secondary"
                    disabled={busy}
                    onClick={() => void act(selected.id, 'run_lab')}
                  >
                    Run voice lab
                  </button>
                ) : null}
                {selected.column === 'go_live' ? (
                  <button
                    type="button"
                    className="compass-btn-secondary"
                    disabled={busy}
                    onClick={() => void act(selected.id, 'go_live')}
                  >
                    Mark live
                  </button>
                ) : null}
                {selected.column === 'checkpoint' ? (
                  <button
                    type="button"
                    className="compass-btn-secondary"
                    disabled={busy}
                    onClick={() =>
                      void act(selected.id, 'checkpoint', { checkpointId: selected.currentCheckpoint })
                    }
                  >
                    Mark checkpoint done
                  </button>
                ) : null}
                {selected.blockedOn ? (
                  <button
                    type="button"
                    className="compass-btn-ghost"
                    disabled={busy}
                    onClick={() => void act(selected.id, 'unblock')}
                  >
                    Clear block
                  </button>
                ) : (
                  <button
                    type="button"
                    className="compass-btn-ghost"
                    disabled={busy}
                    onClick={() => void act(selected.id, 'block', { blockedOn: 'owner' })}
                  >
                    Block on owner
                  </button>
                )}
              </div>
              <p className="text-xs text-neutral-500">
                SMS is a draft. Send from your phone. The board does not text the owner.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
