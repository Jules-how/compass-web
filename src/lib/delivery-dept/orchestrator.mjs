/** Deploy copy of delivery-dept/lib/orchestrator.mjs. Edit the department file first. */
import { readFileSync } from 'node:fs'
import { chooseNumberStrategy, packLabel } from './number-strategy.mjs'
import { PIPELINE_PATH } from './paths.mjs'

const SYDNEY = 'Australia/Sydney'

let cachedPipeline = null

export function loadPipeline() {
  if (cachedPipeline) return cachedPipeline
  cachedPipeline = JSON.parse(readFileSync(PIPELINE_PATH, 'utf8'))
  return cachedPipeline
}

export function resetPipelineCache() {
  cachedPipeline = null
}

export function stepDef(stepId, pipeline = loadPipeline()) {
  return pipeline.steps.find((step) => step.id === stepId) || null
}

export function ownerFirst(name) {
  const first = String(name || '').trim().split(/\s+/)[0]
  return first || 'there'
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function addHours(iso, hours) {
  return new Date(new Date(iso).getTime() + hours * 3600_000).toISOString()
}

function addDaysSydney(iso, days) {
  const date = new Date(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

export function renderTemplate(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] != null && vars[key] !== '' ? String(vars[key]) : ''
  )
}

export function createInstall(input = {}, at = new Date().toISOString()) {
  const pipeline = loadPipeline()
  const id = input.id || `install-${crypto.randomUUID()}`
  const steps = Object.fromEntries(
    pipeline.steps.map((step) => [
      step.id,
      {
        id: step.id,
        status: 'pending',
        owner: step.owner,
        startedAt: null,
        completedAt: null,
        slaDueAt: null,
        blockedOn: null
      }
    ])
  )
  steps.intake_form.status = 'current'
  steps.intake_form.startedAt = at
  steps.intake_form.slaDueAt = addHours(at, stepDef('intake_form', pipeline).slaHours)
  steps.intake_form.blockedOn = 'owner'

  const suggested = chooseNumberStrategy({
    trade: input.trade,
    packId: input.packId,
    carrier: input.carrier,
    lineType: input.lineType,
    afterHoursMode: input.afterHoursMode
  })

  return {
    id,
    source: input.source || 'live',
    clientId: input.clientId || null,
    business: String(input.business || '').trim(),
    ownerName: String(input.ownerName || '').trim(),
    ownerMobile: String(input.ownerMobile || '').trim(),
    city: String(input.city || '').trim(),
    trade: String(input.trade || '').trim(),
    packId: suggested.strategy?.packId || input.packId || null,
    publishedNumber: String(input.publishedNumber || '').trim(),
    carrier: suggested.strategy?.carrier || input.carrier || null,
    lineType: suggested.strategy?.lineType || input.lineType || null,
    calendarId: String(input.calendarId || '').trim(),
    grantEmail: input.grantEmail || 'bookings@switchflow.agency',
    createdAt: at,
    updatedAt: at,
    liveAt: null,
    numberStrategy: null,
    testCall: null,
    checkpoints: { day_1: null, day_7: null, day_25: null },
    currentCheckpoint: null,
    voice: input.voice || {},
    steps,
    notes: input.notes || ''
  }
}

export function currentStepId(install) {
  const pipeline = loadPipeline()
  for (const id of pipeline.columns) {
    const step = install.steps[id]
    if (!step || step.status !== 'done') return id
  }
  return 'checkpoint'
}

export function currentCheckpointId(install) {
  const pipeline = loadPipeline()
  for (const id of pipeline.checkpoints) {
    if (!install.checkpoints[id]) return id
  }
  return null
}

export function syncCheckpointSla(install, at = new Date().toISOString()) {
  const pipeline = loadPipeline()
  const step = install.steps.checkpoint
  if (!step) return install
  const ck = currentCheckpointId(install)
  install.currentCheckpoint = ck
  if (!ck) {
    step.status = 'done'
    step.blockedOn = null
    return install
  }
  step.status = 'current'
  const meta = pipeline.checkpointMeta[ck]
  step.slaDueAt = install.liveAt ? addDaysSydney(install.liveAt, meta.offsetDays) : addHours(at, stepDef('checkpoint', pipeline).slaHours)
  return install
}

export function isActive(install) {
  return currentStepId(install) !== 'checkpoint' || currentCheckpointId(install) != null
}

function openNext(install, justCompleted, at) {
  const pipeline = loadPipeline()
  const idx = pipeline.columns.indexOf(justCompleted)
  const nextId = pipeline.columns[idx + 1]
  if (!nextId) return
  const next = install.steps[nextId]
  if (next.status === 'done') {
    openNext(install, nextId, at)
    return
  }
  next.status = 'current'
  next.startedAt = at
  const def = stepDef(nextId, pipeline)
  if (nextId === 'checkpoint') {
    const ck = currentCheckpointId(install)
    install.currentCheckpoint = ck
    const meta = ck ? pipeline.checkpointMeta[ck] : null
    next.slaDueAt =
      install.liveAt && meta ? addDaysSydney(install.liveAt, meta.offsetDays) : addHours(at, def.slaHours)
    next.blockedOn = null
    return
  }
  next.slaDueAt = addHours(at, def.slaHours)
  next.blockedOn = def.blockedOnDefault
}

export function completeStep(install, stepId, at = new Date().toISOString(), extra = {}) {
  const step = install.steps[stepId]
  if (!step) throw new Error(`unknown_step:${stepId}`)
  if (step.status === 'done') return install
  step.status = 'done'
  step.completedAt = at
  step.blockedOn = null
  if (stepId === 'go_live' && !install.liveAt) install.liveAt = extra.liveAt || at
  if (stepId === 'checkpoint') {
    const ck = extra.checkpointId || currentCheckpointId(install)
    if (ck) install.checkpoints[ck] = at
    step.completedAt = null
    syncCheckpointSla(install, at)
    install.updatedAt = at
    return install
  }
  openNext(install, stepId, at)
  install.updatedAt = at
  return install
}

export function setBlocked(install, stepId, blockedOn) {
  const step = install.steps[stepId || currentStepId(install)]
  if (!step) throw new Error('unknown_step')
  step.blockedOn = blockedOn || null
  install.updatedAt = new Date().toISOString()
  return install
}

export function applyNumberStrategy(install, input, at = new Date().toISOString()) {
  const result = chooseNumberStrategy({
    trade: input.trade || install.trade,
    packId: input.packId || install.packId,
    carrier: input.carrier || install.carrier,
    lineType: input.lineType || install.lineType,
    afterHoursMode: input.afterHoursMode
  })
  if (!result.ok) throw new Error(result.error)
  install.numberStrategy = result.strategy
  install.packId = result.strategy.packId
  install.carrier = result.strategy.carrier
  install.lineType = result.strategy.lineType
  completeStep(install, 'number_strategy', at)
  return install
}

export function recordTestCall(install, labResult, at = new Date().toISOString()) {
  install.testCall = {
    runner: labResult.runner,
    passed: Boolean(labResult.passed),
    scenarios: labResult.scenarios || [],
    note: labResult.note || '',
    at
  }
  if (labResult.passed) completeStep(install, 'test_call', at)
  else setBlocked(install, 'test_call', labResult.blockedOn || 'voice-lab')
  return install
}

export function hydrateFromVoice(install, voice = {}, at = new Date().toISOString()) {
  install.voice = { ...install.voice, ...voice }
  if (voice.trade_pack_id) install.packId = voice.trade_pack_id
  if (voice.calendar_id) install.calendarId = voice.calendar_id
  if (voice.public_number) install.publishedNumber = voice.public_number
  if (voice.owner_mobile) install.ownerMobile = voice.owner_mobile

  if (install.steps.intake_form.status !== 'done') {
    completeStep(install, 'intake_form', at)
  }
  if (voice.twilio_number && voice.retell_agent_id && voice.trade_pack_id && !install.numberStrategy) {
    applyNumberStrategy(
      install,
      {
        packId: voice.trade_pack_id,
        carrier: install.carrier,
        lineType: install.lineType
      },
      at
    )
  } else if (install.numberStrategy && install.steps.number_strategy.status !== 'done') {
    completeStep(install, 'number_strategy', at)
  }
  if (voice.twilio_number && voice.retell_agent_id && voice.trade_pack_id) {
    if (install.steps.retell_agent.status !== 'done') completeStep(install, 'retell_agent', at)
  }
  if (voice.probe_ok && !voice.calendar_grant_broken) {
    if (install.steps.calendar_grant.status !== 'done') completeStep(install, 'calendar_grant', at)
  } else if (voice.calendar_grant_broken) {
    setBlocked(install, 'calendar_grant', 'owner')
  }
  if (voice.live_at) {
    install.liveAt = voice.live_at
    if (install.steps.go_live.status !== 'done') completeStep(install, 'go_live', voice.live_at, { liveAt: voice.live_at })
  }
  return install
}

export function smsVars(install, stepId = currentStepId(install)) {
  const pipeline = loadPipeline()
  const ck = install.currentCheckpoint || currentCheckpointId(install)
  return {
    ownerFirst: ownerFirst(install.ownerName),
    business: install.business || 'your shop',
    carrier: install.carrier || 'your',
    lineType: install.lineType || 'line',
    publishedNumber: install.publishedNumber || 'the published number',
    packLabel: packLabel(install.packId),
    grantEmail: install.grantEmail || 'bookings@switchflow.agency',
    checkpointLabel: ck ? pipeline.checkpointMeta[ck].label : 'Checkpoint'
  }
}

export function renderSms(install, stepId = currentStepId(install)) {
  const def = stepDef(stepId)
  if (!def) return ''
  return renderTemplate(def.sms, smsVars(install, stepId)).replace(/\s+/g, ' ').trim()
}

export function slaState(install, now = new Date().toISOString()) {
  const id = currentStepId(install)
  const step = install.steps[id]
  const due = step?.slaDueAt
  if (!due || step.status === 'done') {
    return { stepId: id, status: 'none', dueAt: due, remainingMs: null, overdue: false }
  }
  const remainingMs = new Date(due).getTime() - new Date(now).getTime()
  const overdue = remainingMs < 0
  return {
    stepId: id,
    status: overdue ? 'overdue' : remainingMs < 30 * 60_000 ? 'due_soon' : 'on_track',
    dueAt: due,
    remainingMs,
    overdue
  }
}

export function julesMinutesRemaining(install) {
  const pipeline = loadPipeline()
  let minutes = 0
  for (const id of pipeline.columns) {
    const step = install.steps[id]
    if (step.status === 'done') continue
    if (id === 'checkpoint') {
      for (const ck of pipeline.checkpoints) {
        if (!install.checkpoints[ck]) minutes += pipeline.checkpointMeta[ck].julesMinutes
      }
      continue
    }
    minutes += stepDef(id, pipeline).julesMinutes
  }
  return minutes
}

export function formatSla(remainingMs) {
  if (remainingMs == null) return '—'
  const abs = Math.abs(remainingMs)
  const hours = Math.floor(abs / 3600_000)
  const mins = Math.round((abs % 3600_000) / 60_000)
  const body = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  return remainingMs < 0 ? `${body} overdue` : `${body} left`
}

export function boardCard(install, now = new Date().toISOString()) {
  const pipeline = loadPipeline()
  const stepId = currentStepId(install)
  const def = stepDef(stepId, pipeline)
  const sla = slaState(install, now)
  const checkpointId = stepId === 'checkpoint' ? currentCheckpointId(install) : null
  return {
    ...clone(install),
    column: stepId,
    columnTitle: checkpointId ? pipeline.checkpointMeta[checkpointId].label : def.column,
    stepTitle: def.title,
    stepOwner: def.owner,
    blockedOn: install.steps[stepId]?.blockedOn || null,
    sla,
    slaLabel: formatSla(sla.remainingMs),
    julesMinutesLeft: julesMinutesRemaining(install),
    sms: renderSms(install, stepId),
    active: isActive(install)
  }
}

export function boardColumns(installs, now = new Date().toISOString()) {
  const pipeline = loadPipeline()
  const cards = installs.map((install) => boardCard(install, now))
  return pipeline.columns.map((id) => ({
    id,
    title: stepDef(id, pipeline).column,
    owner: stepDef(id, pipeline).owner,
    cards: cards.filter((card) => card.column === id && card.active)
  }))
}

export function capacity(installs) {
  const pipeline = loadPipeline()
  const active = installs.filter((install) => install.source !== 'demo' && isActive(install)).length
  const demoActive = installs.filter((install) => install.source === 'demo' && isActive(install)).length
  const julesMinutes = installs
    .filter((install) => install.source !== 'demo' && isActive(install))
    .reduce((sum, install) => sum + julesMinutesRemaining(install), 0)
  return {
    liveActive: active,
    demoActive,
    cap: pipeline.capacity,
    remaining: Math.max(0, pipeline.capacity - active),
    full: active >= pipeline.capacity,
    julesMinutes,
    julesHoursCap: pipeline.julesHoursCap,
    timezone: SYDNEY
  }
}

export { SYDNEY, chooseNumberStrategy }
