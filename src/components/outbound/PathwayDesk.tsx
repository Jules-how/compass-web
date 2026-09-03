'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingBlock } from '@/components/LoadingBlock'
import { PATHWAY_TOOLS, type PathwayStage, type PathwayTool } from '@/lib/pathway'
import { useCachedJson } from '@/lib/use-cached-json'

type Template = {
  id: string
  recipeId: string
  label: string
  signalWhen: { field: string; op: string; value?: string }
  structure: string
  subject: string
  style: string | null
  pendingStructure: string | null
}

type PathwayPayload = {
  trade: string
  campaignId: string | null
  stages: PathwayStage[]
  defaultRecipe: { id: string; trade: string; templates: Template[] }
  overlay: { id: string; templates: Template[] } | null
  runs: Array<{
    id: string
    campaign_id: string | null
    status: string
    cost_cents: number | null
    duration_ms: number | null
    sendable_count: number | null
    opener_coverage: number | null
    detail: string | null
    created_at: string
  }>
  campaigns: Array<{ id: string; name: string; trade: string | null }>
}

type ChunkPayload = {
  campaignId: string
  leads: Array<{
    id: string
    name: string | null
    email: string | null
    company: string | null
    city: string | null
    opener: string | null
    opener_template_id: string | null
    opener_override: boolean
  }>
}

const TRADES = ['hvac', 'plumber', 'electrician', 'locksmith']

export function PathwayDesk() {
  const [trade, setTrade] = useState('hvac')
  const [campaignId, setCampaignId] = useState('')
  const query = `/api/outbound/pathways?trade=${encodeURIComponent(trade)}${
    campaignId ? `&campaignId=${encodeURIComponent(campaignId)}` : ''
  }`
  const pathways = useCachedJson<PathwayPayload>(query, query, { staleMs: 15_000 })
  const chunkKey = campaignId
    ? `/api/outbound/opener-chunk?campaignId=${encodeURIComponent(campaignId)}`
    : null
  const chunk = useCachedJson<ChunkPayload>(chunkKey, chunkKey, { staleMs: 10_000 })

  const [stages, setStages] = useState<PathwayStage[] | null>(null)
  const [label, setLabel] = useState('')
  const [field, setField] = useState('paid_demand')
  const [structure, setStructure] = useState('')
  const [subject, setSubject] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const liveStages = stages ?? pathways.data?.stages ?? []
  const templates = useMemo(() => {
    const base = pathways.data?.defaultRecipe.templates ?? []
    const extra = pathways.data?.overlay?.templates ?? []
    return [...base, ...extra]
  }, [pathways.data])

  async function saveStages(kind: 'default' | 'overlay') {
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/outbound/pathways', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          trade,
          campaignId: kind === 'overlay' ? campaignId : undefined,
          stages: liveStages
        })
      })
      if (!res.ok) throw new Error('Save failed')
      setNote(kind === 'overlay' ? 'List overlay saved' : 'Trade default saved')
      await pathways.reload(true)
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function addTemplate() {
    if (!label.trim() || !structure.trim()) return
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/outbound/pathways/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeId: pathways.data?.defaultRecipe.id,
          trade,
          label,
          field,
          structure,
          subject
        })
      })
      if (!res.ok) throw new Error('Template create failed')
      setLabel('')
      setStructure('')
      setSubject('')
      await pathways.reload(true)
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function propose(id: string, pendingStructure: string, pendingSubject: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/outbound/pathways/templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, pendingStructure, pendingSubject })
      })
      if (!res.ok) throw new Error('Propose failed')
      await pathways.reload(true)
    } finally {
      setBusy(false)
    }
  }

  async function accept(id: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/outbound/pathways/templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, accept: true })
      })
      const body = (await res.json().catch(() => ({}))) as { updated?: number; error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Accept failed')
      setNote(`Regenerated ${body.updated ?? 0} sibling openers`)
      await pathways.reload(true)
      await chunk.reload(true)
    } finally {
      setBusy(false)
    }
  }

  async function patchLead(id: string, patch: Record<string, unknown>) {
    const res = await fetch('/api/outbound/opener-chunk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch })
    })
    if (!res.ok) return
    await chunk.reload(true)
  }

  if (pathways.loading && !pathways.data) return <LoadingBlock label="Loading pathway…" />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-neutral-500">
          Trade
          <select
            className="compass-input ml-2"
            value={trade}
            onChange={(e) => {
              setTrade(e.target.value)
              setStages(null)
            }}
          >
            {TRADES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-500">
          List overlay
          <select
            className="compass-input ml-2 min-w-[12rem]"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
          >
            <option value="">Trade default only</option>
            {(pathways.data?.campaigns ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {note ? <p className="text-sm text-neutral-600">{note}</p> : null}

      <Card>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-neutral-900">Stages and tools</h2>
          <p className="text-xs text-neutral-500">
            Cursor runs these. Compass does not scrape. Skip a stage or swap the tool.
          </p>
          <div className="space-y-2">
            {liveStages.map((stage, index) => (
              <div
                key={stage.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-100 bg-stone-50/40 px-3 py-2"
              >
                <span className="w-28 text-sm font-medium text-neutral-800">{stage.id}</span>
                <select
                  className="compass-input"
                  value={stage.skip ? 'skip' : stage.tool}
                  onChange={(e) => {
                    const tool = e.target.value as PathwayTool
                    setStages(
                      liveStages.map((row, i) =>
                        i === index ? { ...row, tool, skip: tool === 'skip' } : row
                      )
                    )
                  }}
                >
                  {PATHWAY_TOOLS.map((tool) => (
                    <option key={tool} value={tool}>
                      {tool}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveStages('default')}
              className="compass-btn-secondary"
            >
              Save as trade default
            </button>
            <button
              type="button"
              disabled={busy || !campaignId}
              onClick={() => void saveStages('overlay')}
              className="compass-btn-primary"
            >
              Save list overlay
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-neutral-900">Opener templates</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                busy={busy}
                onPropose={propose}
                onAccept={accept}
              />
            ))}
          </div>
          <div className="rounded-xl border border-stone-200/80 p-3">
            <p className="mb-2 text-xs font-medium text-neutral-500">Add signal / template</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="compass-input" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
              <input className="compass-input" placeholder="Lead field (paid_demand)" value={field} onChange={(e) => setField(e.target.value)} />
              <input className="compass-input sm:col-span-2" placeholder="Structure with {company} {suburb} {specialty}" value={structure} onChange={(e) => setStructure(e.target.value)} />
              <input className="compass-input sm:col-span-2" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <button type="button" disabled={busy} onClick={() => void addTemplate()} className="compass-btn-secondary mt-2">
              Add template
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-neutral-900">Run log</h2>
          {(pathways.data?.runs ?? []).length === 0 ? (
            <p className="text-sm text-neutral-500">No runs yet. Agent POSTs /api/agent/outbound/pathway/runs.</p>
          ) : (
            <ul className="divide-y divide-stone-100 rounded-xl border border-stone-100">
              {(pathways.data?.runs ?? []).map((run) => (
                <li key={run.id} className="px-3 py-2.5 text-sm">
                  <span className="font-medium text-neutral-900">{run.status}</span>
                  <span className="text-neutral-500">
                    {' '}
                    · {run.sendable_count ?? '—'} sendable · {run.cost_cents != null ? `$${(run.cost_cents / 100).toFixed(2)}` : 'no $'} ·{' '}
                    {run.duration_ms != null ? `${Math.round(run.duration_ms / 1000)}s` : '—'}
                  </span>
                  {run.detail ? <p className="text-[11px] text-neutral-500">{run.detail}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {campaignId ? (
        <Card>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-neutral-900">Opener chunk</h2>
            <p className="text-xs text-neutral-500">
              Edit the line, or tick override so a waterfall accept will not yank this lead back.
            </p>
            {(chunk.data?.leads ?? []).map((lead) => (
              <div key={lead.id} className="rounded-xl border border-stone-100 px-3 py-2.5">
                <div className="text-sm font-medium text-neutral-900">{lead.company || lead.name || lead.email}</div>
                <textarea
                  className="compass-input mt-2 min-h-[4rem]"
                  defaultValue={lead.opener ?? ''}
                  onBlur={(e) => {
                    if (e.target.value !== (lead.opener ?? '')) {
                      void patchLead(lead.id, { opener: e.target.value })
                    }
                  }}
                />
                <label className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
                  <input
                    type="checkbox"
                    checked={Boolean(lead.opener_override)}
                    onChange={(e) => void patchLead(lead.id, { opener_override: e.target.checked })}
                  />
                  Override (keep this template)
                </label>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function TemplateCard({
  template,
  busy,
  onPropose,
  onAccept
}: {
  template: Template
  busy: boolean
  onPropose: (id: string, structure: string, subject: string) => Promise<void>
  onAccept: (id: string) => Promise<void>
}) {
  const [structure, setStructure] = useState(template.pendingStructure || template.structure)
  const [subject, setSubject] = useState(template.subject)
  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50/40 p-3">
      <div className="text-sm font-medium text-neutral-900">{template.label}</div>
      <p className="text-[11px] text-neutral-500">
        {template.signalWhen.field} {template.signalWhen.op}
        {template.pendingStructure ? ' · proposed' : ''}
      </p>
      <textarea className="compass-input mt-2 min-h-[5rem]" value={structure} onChange={(e) => setStructure(e.target.value)} />
      <input className="compass-input mt-2" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy}
          className="compass-btn-secondary !px-3 !py-1 text-[11px]"
          onClick={() => void onPropose(template.id, structure, subject)}
        >
          Propose
        </button>
        <button
          type="button"
          disabled={busy || !template.pendingStructure}
          className="compass-btn-primary !px-3 !py-1 text-[11px]"
          onClick={() => void onAccept(template.id)}
        >
          Accept and regenerate siblings
        </button>
      </div>
    </div>
  )
}
