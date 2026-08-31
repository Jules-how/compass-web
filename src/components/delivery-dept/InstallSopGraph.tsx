'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Database,
  FileInput,
  GripVertical,
  ImagePlus,
  Link2,
  ListChecks,
  Megaphone,
  MessageSquare,
  Minus,
  Phone,
  Plus,
  Route,
  Save,
  Search,
  ShieldAlert,
  X
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  createDefaultSopPlan,
  createSopPlanFromLegacySteps,
  getSopNode,
  normalizeSopPlan,
  reorderSopPlan,
  SOP_NODE_CATALOG,
  type SopNodeDefinition,
  type SopPlan,
  type SopStatus
} from '@/lib/delivery-dept/sop-template'

type InstallSummary = {
  id: string
  business: string
  city: string
  trade: string
  source: string
  sopPlan?: SopPlan
  steps: Record<string, { status: string; blockedOn: string | null }>
}

type InstallSopGraphProps = {
  board: {
    sopTemplate?: SopPlan
    columns: Array<{ cards: InstallSummary[] }>
  }
  selectedInstallId: string | null
  onSelectInstall: (id: string | null) => void
}

const iconMap = {
  clipboard: ClipboardList,
  route: Route,
  phone: Phone,
  bot: Bot,
  calendar: CalendarDays,
  database: Database,
  listChecks: ListChecks,
  handoff: Link2,
  megaphone: Megaphone,
  chart: BarChart3,
  facebook: MessageSquare,
  google: Search,
  image: ImagePlus
} as const

const statusMap = {
  not_started: {
    label: 'Not started',
    className: 'border-stone-200 bg-stone-50 text-stone-600',
    Icon: FileInput
  },
  in_progress: {
    label: 'In progress',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    Icon: AlertCircle
  },
  blocked: {
    label: 'Blocked',
    className: 'border-red-200 bg-red-50 text-red-700',
    Icon: ShieldAlert
  },
  verified: {
    label: 'Verified',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    Icon: CheckCircle2
  },
  not_wired: {
    label: 'Not wired',
    className: 'border-red-200 bg-red-50 text-red-700',
    Icon: ShieldAlert
  }
} satisfies Record<SopStatus, { label: string; className: string; Icon: typeof FileInput }>

function ownerLabel(owner: SopNodeDefinition['owner']) {
  if (owner === 'jules') return 'You'
  if (owner === 'client') return 'Client'
  return 'Automated'
}

function channelLabel(channel: SopNodeDefinition['channel']) {
  if (channel === 'meta') return 'Meta'
  if (channel === 'google') return 'Google'
  return 'Shared'
}

function allInstalls(board: InstallSopGraphProps['board']) {
  return board.columns.flatMap((column) => column.cards)
}

function planForInstall(install: InstallSummary): SopPlan {
  if (install.sopPlan) {
    try {
      return normalizeSopPlan(install.sopPlan)
    } catch {
      return createSopPlanFromLegacySteps(install.steps)
    }
  }
  return createSopPlanFromLegacySteps(install.steps)
}

function statusLabel(plan: SopPlan, nodeId: string) {
  return statusMap[plan.statuses[nodeId] || 'not_started']
}

export function InstallSopGraph({
  board,
  selectedInstallId,
  onSelectInstall
}: InstallSopGraphProps) {
  const installs = useMemo(() => allInstalls(board), [board])
  const selectedInstall = installs.find((install) => install.id === selectedInstallId) || null
  const [scope, setScope] = useState<'template' | 'install'>('template')
  const [templatePlan, setTemplatePlan] = useState<SopPlan>(
    board.sopTemplate ? normalizeSopPlan(board.sopTemplate) : createDefaultSopPlan()
  )
  const [installPlan, setInstallPlan] = useState<SopPlan | null>(
    selectedInstall ? planForInstall(selectedInstall) : null
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [showPalette, setShowPalette] = useState(false)
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const activePlan = scope === 'template' ? templatePlan : installPlan
  const activeDefinitions = activePlan
    ? activePlan.nodes.map((nodeId) => getSopNode(nodeId)).filter(Boolean) as SopNodeDefinition[]
    : []
  const selectedNode =
    (selectedNodeId ? getSopNode(selectedNodeId) : null) ||
    activeDefinitions[0] ||
    null
  const availableNodes = SOP_NODE_CATALOG.filter((node) => !activePlan?.nodes.includes(node.id))

  useEffect(() => {
    if (board.sopTemplate) {
      try {
        setTemplatePlan(normalizeSopPlan(board.sopTemplate))
      } catch {
        setTemplatePlan(createDefaultSopPlan())
      }
    }
  }, [board.sopTemplate])

  useEffect(() => {
    setInstallPlan(selectedInstall ? planForInstall(selectedInstall) : null)
  }, [selectedInstall])

  useEffect(() => {
    if (!selectedInstall && scope === 'install') {
      setScope('template')
      setDirty(false)
      setMessage(null)
    } else if (scope === 'install') {
      setDirty(false)
      setMessage(null)
    }
  }, [selectedInstall, scope])

  useEffect(() => {
    if (!activePlan?.nodes.length) {
      setSelectedNodeId(null)
      return
    }
    if (!selectedNodeId || !activePlan.nodes.includes(selectedNodeId)) {
      setSelectedNodeId(activePlan.nodes[0])
    }
  }, [activePlan, selectedNodeId])

  function setPlan(next: SopPlan) {
    if (scope === 'template') setTemplatePlan(next)
    else setInstallPlan(next)
    setDirty(true)
    setMessage(null)
  }

  function updateNode(id: string, update: (plan: SopPlan) => SopPlan) {
    if (!activePlan) return
    try {
      setPlan(normalizeSopPlan(update(activePlan)))
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Invalid workflow change'
      setMessage(detail.startsWith('invalid_sop_dependency') ? 'That move would break a required dependency.' : detail)
    }
  }

  function addNode(id: string) {
    if (!activePlan) return
    const definition = getSopNode(id)
    if (!definition) return
    const positions = new Map(activePlan.nodes.map((nodeId, index) => [nodeId, index]))
    const dependencyPositions = definition.dependsOn
      .map((dependency) => positions.get(dependency))
      .filter((position): position is number => position != null)
    const insertAt = dependencyPositions.length ? Math.max(...dependencyPositions) + 1 : activePlan.nodes.length
    const nodes = [...activePlan.nodes]
    nodes.splice(insertAt, 0, id)
    updateNode(id, (plan) => ({
      ...plan,
      nodes,
      statuses: { ...plan.statuses, [id]: definition.required ? 'not_started' : 'not_wired' }
    }))
    setSelectedNodeId(id)
    setShowPalette(false)
  }

  function removeNode(id: string) {
    const definition = getSopNode(id)
    if (!activePlan || !definition) return
    if (definition.required) {
      setMessage('Required stages stay in the core workflow.')
      return
    }
    const dependent = activePlan.nodes.find((nodeId) => getSopNode(nodeId)?.dependsOn.includes(id))
    if (dependent) {
      setMessage(`${getSopNode(dependent)?.title || 'Another stage'} depends on this stage.`)
      return
    }
    updateNode(id, (plan) => {
      const statuses = { ...plan.statuses }
      const blockers = { ...plan.blockers }
      delete statuses[id]
      delete blockers[id]
      return {
        ...plan,
        nodes: plan.nodes.filter((nodeId) => nodeId !== id),
        statuses,
        blockers
      }
    })
  }

  function moveNode(fromId: string, toId: string) {
    if (!activePlan) return
    try {
      setPlan(reorderSopPlan(activePlan, fromId, toId))
    } catch {
      setMessage('That move would break a required dependency.')
    }
  }

  function moveAdjacent(id: string, direction: -1 | 1) {
    if (!activePlan) return
    const index = activePlan.nodes.indexOf(id)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= activePlan.nodes.length) return
    moveNode(id, activePlan.nodes[nextIndex])
  }

  function changeStatus(id: string, status: SopStatus) {
    updateNode(id, (plan) => ({
      ...plan,
      statuses: { ...plan.statuses, [id]: status },
      blockers:
        status === 'blocked'
          ? plan.blockers
          : Object.fromEntries(Object.entries(plan.blockers).filter(([nodeId]) => nodeId !== id))
    }))
  }

  function changeBlocker(id: string, value: string) {
    updateNode(id, (plan) => ({
      ...plan,
      blockers: value.trim()
        ? { ...plan.blockers, [id]: value }
        : Object.fromEntries(Object.entries(plan.blockers).filter(([nodeId]) => nodeId !== id))
    }))
  }

  async function savePlan() {
    if (!activePlan || saving) return
    if (scope === 'install' && !selectedInstall) return
    setSaving(true)
    setMessage(null)
    try {
      const endpoint =
        scope === 'template'
          ? '/api/delivery-dept/sop'
          : `/api/delivery-dept/installs/${encodeURIComponent(selectedInstall?.id || '')}`
      const body =
        scope === 'template'
          ? { plan: activePlan }
          : { action: 'save_sop_plan', plan: activePlan }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        plan?: SopPlan
        install?: { sopPlan?: SopPlan }
      }
      if (!response.ok) throw new Error(payload.error || `Save failed (${response.status})`)
      const saved =
        scope === 'template'
          ? payload.plan
          : payload.install?.sopPlan
      if (saved) {
        if (scope === 'template') setTemplatePlan(normalizeSopPlan(saved))
        else setInstallPlan(normalizeSopPlan(saved))
      }
      setDirty(false)
      setMessage(scope === 'template' ? 'Future install template saved.' : 'Current install workflow saved.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!activePlan) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Install SOP</CardTitle>
          <CardDescription>Select an install below to edit its workflow.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-stone-100">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="compass-section-label">Implementation SOP</p>
            <CardTitle className="mt-1">Build the lead delivery system</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              Configure the client system first. Lead handling appears inside the relevant stages. Ads stay off until capture passes the end to end test.
            </CardDescription>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <div className="flex rounded-xl bg-stone-100 p-1" role="group" aria-label="Workflow editing scope">
              <button
                type="button"
                aria-pressed={scope === 'template'}
                className={scope === 'template' ? 'compass-btn-primary' : 'compass-btn-ghost'}
                onClick={() => {
                  setScope('template')
                  setDirty(false)
                  setMessage(null)
                }}
              >
                Future template
              </button>
              <button
                type="button"
                aria-pressed={scope === 'install'}
                disabled={!selectedInstall}
                className={scope === 'install' ? 'compass-btn-primary' : 'compass-btn-ghost'}
                onClick={() => {
                  if (!selectedInstall) return
                  setScope('install')
                  setDirty(false)
                  setMessage(null)
                }}
              >
                Current install
              </button>
            </div>
            <select
              className="compass-input min-w-[190px]"
              value={selectedInstallId || ''}
              onChange={(event) => onSelectInstall(event.target.value || null)}
              aria-label="Choose current install"
            >
              <option value="">Choose an install</option>
              {installs.map((install) => (
                <option key={install.id} value={install.id}>
                  {install.business || 'Unnamed install'}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant={scope === 'template' ? 'primary' : 'secondary'} appearance="light" size="sm">
            {scope === 'template' ? 'Editing future installs' : `Editing ${selectedInstall?.business || 'current install'}`}
          </Badge>
          <Badge variant={dirty ? 'warning' : 'secondary'} appearance="light" size="sm">
            {dirty ? 'Unsaved changes' : 'Saved'}
          </Badge>
          {selectedInstall && scope === 'template' ? (
            <span className="text-xs text-neutral-500">
              Current install: {selectedInstall.business || 'Unnamed install'}
            </span>
          ) : null}
          {message ? <span className="text-xs text-neutral-600">{message}</span> : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="compass-section-label">Workflow map</p>
            <p className="mt-1 text-sm text-neutral-500">
              Drag a stage to reorder it. Dependencies are enforced. Use the arrow buttons on smaller screens.
            </p>
          </div>
          <button
            type="button"
            className="compass-btn-secondary inline-flex items-center gap-2"
            onClick={() => setShowPalette((open) => !open)}
            aria-expanded={showPalette}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add stage
          </button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-neutral-500" aria-label="Workflow status legend">
          {(['verified', 'in_progress', 'blocked', 'not_wired', 'not_started'] as SopStatus[]).map((status) => {
            const meta = statusMap[status]
            const StatusIcon = meta.Icon
            return (
              <span key={status} className="inline-flex items-center gap-1.5">
                <StatusIcon className={`size-3.5 ${meta.className.split(' ').find((token) => token.startsWith('text-')) || ''}`} aria-hidden="true" />
                {meta.label}
              </span>
            )
          })}
        </div>

        {showPalette ? (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-800">Optional stages</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Add a channel or capability to this {scope === 'template' ? 'template' : 'install'}.
                </p>
              </div>
              <button
                type="button"
                className="compass-btn-ghost"
                onClick={() => setShowPalette(false)}
                aria-label="Close optional stages"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            {availableNodes.length ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {availableNodes.map((node) => {
                  const Icon = iconMap[node.icon]
                  return (
                    <button
                      key={node.id}
                      type="button"
                      className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-3 text-left transition hover:border-[var(--compass-accent)]/40"
                      onClick={() => addNode(node.id)}
                    >
                      <span className="rounded-lg bg-stone-100 p-2 text-neutral-600">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-neutral-800">{node.title}</span>
                        <span className="mt-0.5 block text-xs text-neutral-500">{channelLabel(node.channel)}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-neutral-500">All available stages are already in this workflow.</p>
            )}
          </div>
        ) : null}

        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max items-stretch gap-2" role="list" aria-label="Install SOP stages">
            {activeDefinitions.map((node, index) => {
              const Icon = iconMap[node.icon]
              const status = statusLabel(activePlan, node.id)
              const StatusIcon = status.Icon
              const isSelected = selectedNode?.id === node.id
              return (
                <div key={node.id} className="flex items-center gap-2" role="listitem">
                  <button
                    type="button"
                    draggable
                    onDragStart={() => setDraggedNodeId(node.id)}
                    onDragEnd={() => setDraggedNodeId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault()
                      if (draggedNodeId) moveNode(draggedNodeId, node.id)
                      setDraggedNodeId(null)
                    }}
                    onClick={() => setSelectedNodeId(node.id)}
                    className={[
                      'group relative flex w-[184px] flex-col rounded-2xl border bg-white p-3 text-left shadow-soft transition',
                      isSelected
                        ? 'border-[var(--compass-accent)]/60 ring-2 ring-[var(--compass-accent)]/10'
                        : 'border-stone-200/80 hover:border-stone-300',
                      draggedNodeId === node.id ? 'opacity-50' : ''
                    ].join(' ')}
                    aria-label={`${node.title}, ${status.label}`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="rounded-xl bg-stone-100 p-2 text-neutral-700">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className={`rounded-full border px-1.5 py-1 ${status.className}`} title={status.label}>
                        <StatusIcon className="size-3.5" aria-hidden="true" />
                      </span>
                    </span>
                    <span className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                      {node.kicker}
                    </span>
                    <span className="mt-1 text-sm font-semibold text-neutral-900">{node.title}</span>
                    <span className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">{node.summary}</span>
                    <span className="mt-3 flex items-center justify-between gap-2 text-[11px] text-neutral-400">
                      <span>{ownerLabel(node.owner)}</span>
                      <GripVertical className="size-3.5 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                    </span>
                    {!node.required ? (
                      <span className="absolute -right-2 -top-2 rounded-full border border-stone-200 bg-white p-1 text-neutral-400 shadow-sm">
                        <Plus className="size-3" aria-hidden="true" />
                      </span>
                    ) : null}
                  </button>
                  {index < activeDefinitions.length - 1 ? (
                    <ArrowRight className="size-4 shrink-0 text-stone-300" aria-hidden="true" />
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        {selectedNode ? (
          <div className="grid gap-5 border-t border-stone-100 pt-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  {(() => {
                    const Icon = iconMap[selectedNode.icon]
                    return (
                      <span className="rounded-xl bg-white p-3 text-neutral-700 shadow-sm">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                    )
                  })()}
                  <div>
                    <p className="compass-section-label">{selectedNode.kicker}</p>
                    <h3 className="mt-1 text-lg font-semibold text-neutral-900">{selectedNode.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-neutral-600">{selectedNode.detail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={selectedNode.required ? 'secondary' : 'outline'} appearance="light" size="sm">
                    {selectedNode.required ? 'Required' : 'Optional'}
                  </Badge>
                  <Badge variant="outline" appearance="light" size="sm">
                    {channelLabel(selectedNode.channel)}
                  </Badge>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-stone-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Why it exists</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-700">{selectedNode.why}</p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Owner and dependencies</p>
                  <p className="mt-2 text-sm text-neutral-700">
                    {ownerLabel(selectedNode.owner)}
                    {selectedNode.dependsOn.length
                      ? ` · after ${selectedNode.dependsOn.map((id) => getSopNode(id)?.title || id).join(', ')}`
                      : ' · no dependency'}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-stone-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Completion checklist</p>
                  <ul className="mt-3 space-y-2">
                    {selectedNode.acceptance.map((item) => (
                      <li key={item} className="flex gap-2 text-sm leading-5 text-neutral-700">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-neutral-400" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Evidence to keep</p>
                  <ul className="mt-3 space-y-2">
                    {selectedNode.evidence.map((item) => (
                      <li key={item} className="flex gap-2 text-sm leading-5 text-neutral-700">
                        <Link2 className="mt-0.5 size-4 shrink-0 text-neutral-400" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <aside className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="compass-section-label">Stage controls</p>
                  <p className="mt-1 text-sm font-semibold text-neutral-900">{selectedNode.title}</p>
                </div>
                {scope === 'install' ? (
                  <span className={`rounded-full border p-1.5 ${statusLabel(activePlan, selectedNode.id).className}`}>
                    {(() => {
                      const StatusIcon = statusLabel(activePlan, selectedNode.id).Icon
                      return <StatusIcon className="size-4" aria-hidden="true" />
                    })()}
                  </span>
                ) : null}
              </div>

              {scope === 'install' ? (
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-medium text-neutral-600" htmlFor={`status-${selectedNode.id}`}>
                    Status
                  </label>
                  <select
                    id={`status-${selectedNode.id}`}
                    className="compass-input w-full"
                    value={activePlan.statuses[selectedNode.id] || 'not_started'}
                    onChange={(event) => changeStatus(selectedNode.id, event.target.value as SopStatus)}
                  >
                    <option value="not_started">Not started</option>
                    <option value="in_progress">In progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="verified">Verified</option>
                    <option value="not_wired">Not wired</option>
                  </select>
                  {activePlan.statuses[selectedNode.id] === 'blocked' ? (
                    <input
                      className="compass-input w-full"
                      value={activePlan.blockers[selectedNode.id] || ''}
                      onChange={(event) => changeBlocker(selectedNode.id, event.target.value)}
                      placeholder="What is blocking this stage?"
                      aria-label={`Blocker for ${selectedNode.title}`}
                    />
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 rounded-xl bg-stone-50 p-3 text-sm leading-6 text-neutral-600">
                  The template describes the work. Completion status belongs to a specific client install.
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="compass-btn-primary inline-flex items-center gap-2"
                  disabled={!dirty || saving || (scope === 'install' && !selectedInstall)}
                  onClick={() => void savePlan()}
                >
                  <Save className="size-4" aria-hidden="true" />
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                {!selectedNode.required ? (
                  <button
                    type="button"
                    className="compass-btn-ghost inline-flex items-center gap-2 text-red-600"
                    onClick={() => removeNode(selectedNode.id)}
                  >
                    <Minus className="size-4" aria-hidden="true" />
                    Remove stage
                  </button>
                ) : null}
              </div>

              <div className="mt-5 border-t border-stone-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Reorder</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="compass-btn-secondary inline-flex items-center justify-center gap-2"
                    onClick={() => moveAdjacent(selectedNode.id, -1)}
                    disabled={activePlan.nodes.indexOf(selectedNode.id) === 0}
                  >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Earlier
                  </button>
                  <button
                    type="button"
                    className="compass-btn-secondary inline-flex items-center justify-center gap-2"
                    onClick={() => moveAdjacent(selectedNode.id, 1)}
                    disabled={activePlan.nodes.indexOf(selectedNode.id) === activePlan.nodes.length - 1}
                  >
                    Later
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Arrow controls provide the keyboard and touch alternative to drag and drop.
                </p>
              </div>

              <div className="mt-5 rounded-xl border border-stone-100 bg-stone-50 p-3 text-xs leading-5 text-neutral-500">
                <p className="font-semibold text-neutral-700">Current implementation note</p>
                <p className="mt-1">
                  “Not wired” means Compass does not currently prove this path. Do not mark it verified until the test evidence exists.
                </p>
              </div>
            </aside>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
