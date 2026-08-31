import type { SupabaseClient } from '@supabase/supabase-js'

import { getPortalAdminClient } from '@/lib/portal-admin'
import {
  campaignUnderperforming,
  formatScoreReason,
  rankActions,
  type RankedActionInput
} from '@/lib/action-ranking'
import {
  parseExecutionContract,
  stringifyExecutionContract,
  type ExecutionContract,
  type ProofClause,
  type ProofGroup
} from '@/lib/execution-contract'
import { appendEvidenceBatch, listEvidence, type EvidenceEventRow } from '@/lib/events'
import { computeOutcomeMetrics } from '@/lib/outbound-outcome-metrics'
import { leadStageFromOutbound } from '@/lib/pipeline-spine'
import { loadSyncSnapshot, upsertSyncSnapshot } from '@/lib/sync-snapshots'
import { parseDealTerms } from '@/lib/qbo-deal'
import { normalizeDoc, viewFromDoc, QBO_DOC_COLUMNS } from '@/lib/qbo'
import { monthlyPeriodsDue } from '@/lib/qbo-invoice.mjs'

export type DigestCompletedItem = {
  task_id: string
  title: string
  evidence_ids: string[]
  why: string
}

export type DigestPartialItem = {
  task_id: string
  title: string
  satisfied: Array<{ groupIndex: number; clauseIndex: number; evidence_ids: string[] }>
  missing: Array<{ groupIndex: number; clauseIndex: number; kind: string }>
}

export type DigestProposedItem = {
  title: string
  due: string | null
  reason: string
  href: string
  key: string
  score?: number
  fingerprint?: string
  proof?: RankedActionInput['proof']
}

export type DailyDecisionDigest = {
  generatedAt: string
  completed: DigestCompletedItem[]
  partial: DigestPartialItem[]
  proposed: DigestProposedItem[]
  needs_you: DigestProposedItem[]
}

type OpenTaskRow = {
  id: string
  title: string
  status: string
  due: string | null
  execution_contract: string | null
}

type InventoryRow = {
  vertical: string
  outbound_status: string
  state: string
  email_usable: boolean
  n: number
}

const DIGEST_SNAPSHOT_ID = 'daily_decision_digest' as const

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function eventMatchesClause(event: EvidenceEventRow, clause: ProofClause): boolean {
  if (event.type !== clause.kind) return false
  if (clause.campaign_id) {
    const campaign = event.campaign || (event.payload.campaign_id as string | undefined)
    if (campaign !== clause.campaign_id) return false
  }
  if (clause.filter) {
    for (const [key, value] of Object.entries(clause.filter)) {
      const payloadVal = event.payload[key]
      const topVal = (event as Record<string, unknown>)[key]
      const actual = payloadVal !== undefined ? payloadVal : topVal
      if (actual !== value) return false
    }
  }
  return true
}

function groupClauseResults(
  group: ProofGroup,
  events: EvidenceEventRow[]
): { satisfiedClauses: Array<{ clauseIndex: number; evidence_ids: string[] }>; allPass: boolean } {
  const clauses = 'all' in group ? group.all : group.any
  const satisfiedClauses: Array<{ clauseIndex: number; evidence_ids: string[] }> = []

  for (let clauseIndex = 0; clauseIndex < clauses.length; clauseIndex += 1) {
    const clause = clauses[clauseIndex]
    const min = clause.min_count ?? 1
    const matched = events.filter((e) => eventMatchesClause(e, clause))
    if (matched.length >= min) {
      satisfiedClauses.push({
        clauseIndex,
        evidence_ids: matched.slice(0, Math.max(min, matched.length)).map((e) => e.id)
      })
    }
  }

  if ('all' in group) {
    return { satisfiedClauses, allPass: satisfiedClauses.length === clauses.length }
  }
  return { satisfiedClauses, allPass: satisfiedClauses.length > 0 }
}

export function matchTaskProof(
  contract: ExecutionContract,
  events: EvidenceEventRow[]
): {
  allPass: boolean
  satisfied: NonNullable<ExecutionContract['satisfied']>
  partial: DigestPartialItem['missing']
} {
  const groups = contract.proof ?? []
  const satisfied: NonNullable<ExecutionContract['satisfied']> = []
  const missing: DigestPartialItem['missing'] = []
  let allPass = groups.length > 0

  groups.forEach((group, groupIndex) => {
    const clauses = 'all' in group ? group.all : group.any
    const result = groupClauseResults(group, events)
    for (const hit of result.satisfiedClauses) {
      satisfied.push({ groupIndex, ...hit })
    }
    if (!result.allPass) {
      allPass = false
      for (let clauseIndex = 0; clauseIndex < clauses.length; clauseIndex += 1) {
        const already = result.satisfiedClauses.some((s) => s.clauseIndex === clauseIndex)
        if (!already) {
          missing.push({ groupIndex, clauseIndex, kind: clauses[clauseIndex].kind })
        }
      }
    }
  })

  return { allPass, satisfied, partial: missing }
}

async function loadPollerWatermark(supabase: SupabaseClient): Promise<string> {
  const snap = await loadSyncSnapshot<{ since?: string }>(supabase, 'evidence_poller_watermark')
  return snap?.payload?.since ?? '1970-01-01T00:00:00.000Z'
}

async function savePollerWatermark(supabase: SupabaseClient, since: string): Promise<void> {
  await upsertSyncSnapshot(supabase, 'evidence_poller_watermark', { since }, 'live')
}

/** Derive evidence from onboarding forms, voice calls, QBO docs, pipeline stage changes. */
export async function pollDerivedEvidence(
  supabase: SupabaseClient,
  since: string
): Promise<{ appended: number }> {
  const events: Parameters<typeof appendEvidenceBatch>[1] = []
  const stamp = new Date().toISOString()

  const { data: forms } = await supabase
    .from('compass_onboarding_forms')
    .select('id,client_id,submitted_at,status')
    .eq('status', 'submitted')
    .gte('submitted_at', since)

  for (const form of forms ?? []) {
    if (!form.submitted_at) continue
    events.push({
      source: 'onboarding',
      type: 'form.submitted',
      client_id: form.client_id,
      ts: form.submitted_at,
      native_id: form.id,
      payload: { form_id: form.id }
    })
  }

  const { data: calls } = await supabase
    .from('compass_voice_calls')
    .select('id,client_id,outcome,started_at,calendar_event_id')
    .gte('created_at', since)

  for (const call of calls ?? []) {
    const type =
      call.outcome === 'booked' ? 'call.booked' : `call.${call.outcome || 'logged'}`
    events.push({
      source: 'voice',
      type,
      client_id: call.client_id,
      ts: call.started_at || stamp,
      native_id: call.id,
      payload: {
        outcome: call.outcome,
        calendar_event_id: call.calendar_event_id
      }
    })
  }

  const { data: qboDocs } = await supabase
    .from('compass_qbo_docs')
    .select(QBO_DOC_COLUMNS)
    .gte('cached_at', since)

  for (const raw of qboDocs ?? []) {
    const doc = normalizeDoc(raw as Record<string, unknown>)
    const view = viewFromDoc(doc)
    const base = {
      source: 'qbo',
      client_id: doc.client_id,
      ts: doc.cached_at,
      native_id: doc.id,
      payload: { doc_id: doc.id, qbo_invoice_id: doc.qbo_invoice_id, state: view.state }
    }
    events.push({ ...base, type: 'invoice.created' })
    if (view.state === 'paid') {
      events.push({
        ...base,
        type: 'invoice.paid',
        native_id: `${doc.id}:paid`,
        idempotency_key: `qbo:invoice.paid:${doc.id}`
      })
    }
    if (view.state === 'overdue') {
      events.push({
        ...base,
        type: 'invoice.overdue',
        native_id: `${doc.id}:overdue`,
        idempotency_key: `qbo:invoice.overdue:${doc.id}`
      })
    }
  }

  const { data: leads } = await supabase
    .from('lead_contacts')
    .select('id,pipeline_stage,outbound_status,vertical,updated_at')
    .gte('updated_at', since)

  for (const lead of leads ?? []) {
    const stage = lead.pipeline_stage || leadStageFromOutbound(lead.outbound_status)
    events.push({
      source: 'compass',
      type: 'pipeline.stage_changed',
      lead_id: lead.id,
      vertical: lead.vertical,
      ts: lead.updated_at,
      native_id: `${lead.id}:${stage}:${lead.updated_at}`,
      payload: { stage, outbound_status: lead.outbound_status }
    })
  }

  if (events.length === 0) return { appended: 0 }
  await appendEvidenceBatch(supabase, events)
  return { appended: events.length }
}

async function loadInventoryUncontacted(supabase: SupabaseClient): Promise<{
  bestVertical: string | null
  topState: string | null
  uncontacted: number
}> {
  const { data, error } = await supabase.rpc('lead_inventory_aggregate', { p_vertical: null })
  if (error || !data) return { bestVertical: null, topState: null, uncontacted: 0 }

  const rows = data as InventoryRow[]
  let uncontacted = 0
  const byVertical = new Map<string, number>()
  const byState = new Map<string, number>()

  for (const row of rows) {
    if (row.outbound_status === 'uncontacted' && row.email_usable) {
      uncontacted += Number(row.n)
      byVertical.set(row.vertical, (byVertical.get(row.vertical) ?? 0) + Number(row.n))
      if (row.state && row.state !== '(blank)') {
        byState.set(row.state, (byState.get(row.state) ?? 0) + Number(row.n))
      }
    }
  }

  let bestVertical: string | null = null
  let bestCount = 0
  for (const [vertical, count] of byVertical) {
    if (count > bestCount) {
      bestVertical = vertical
      bestCount = count
    }
  }

  let topState: string | null = null
  let topStateCount = 0
  for (const [state, count] of byState) {
    if (count > topStateCount) {
      topState = state
      topStateCount = count
    }
  }

  return { bestVertical, topState, uncontacted }
}

async function winningReplyVertical(supabase: SupabaseClient, since: string): Promise<string | null> {
  const events = await listEvidence(supabase, { since, kind: 'email.replied' })
  const counts = new Map<string, number>()
  for (const event of events) {
    if (!event.vertical) continue
    counts.set(event.vertical, (counts.get(event.vertical) ?? 0) + 1)
  }
  let best: string | null = null
  let max = 0
  for (const [vertical, count] of counts) {
    if (count > max) {
      best = vertical
      max = count
    }
  }
  return best
}

async function loadOpenTaskFingerprints(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase
    .from('compass_tasks')
    .select('execution_contract')
    .neq('status', 'completed')
    .neq('status', 'cancelled')
  const out = new Set<string>()
  for (const row of data ?? []) {
    const contract = parseExecutionContract(row.execution_contract)
    if (contract.fingerprint) out.add(contract.fingerprint)
  }
  return out
}

function campaignRatesFromEvents(
  events: EvidenceEventRow[],
  campaignId: string,
  since: string | null
): { delivered: number; positive: number; positiveRate: number } {
  let sent = 0
  let positive = 0
  for (const event of events) {
    if (event.campaign !== campaignId) continue
    if (since && Date.parse(event.ts) < Date.parse(since)) continue
    if (event.type === 'email.sent') {
      const grain = event.payload?.grain
      if (grain === 'day') sent += Number(event.payload?.sent) || 1
      else sent += 1
    }
    if (event.type === 'lead.interested' || event.type === 'lead.meeting_booked') {
      positive += 1
    }
  }
  const metrics = computeOutcomeMetrics({ sent, bounced: 0 }, { positive, meetings: 0 })
  return {
    delivered: metrics.delivered,
    positive,
    positiveRate: metrics.positiveRate
  }
}

async function buildProposedTasks(supabase: SupabaseClient): Promise<DigestProposedItem[]> {
  const candidates: RankedActionInput[] = []
  const openFingerprints = await loadOpenTaskFingerprints(supabase)
  const inventory = await loadInventoryUncontacted(supabase)
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const winning = (await winningReplyVertical(supabase, since30)) || inventory.bestVertical
  const allEvents = await listEvidence(supabase, { since: since90 })

  const { data: overdueDocs } = await supabase
    .from('compass_qbo_docs')
    .select(QBO_DOC_COLUMNS)
    .gt('balance', 0)
  for (const raw of overdueDocs ?? []) {
    const doc = normalizeDoc(raw as Record<string, unknown>)
    const view = viewFromDoc(doc)
    if (view.state !== 'overdue') continue
    const balance = Number(doc.balance) || 0
    const fingerprint = `invoice-overdue:${doc.id}`
    if (openFingerprints.has(fingerprint)) continue
    candidates.push({
      key: fingerprint,
      title: `Chase overdue invoice · ${doc.doc_number || doc.id}`,
      due: todayIsoDate(),
      href: `/clients/${doc.client_id}`,
      cashAtStake: balance,
      urgency: 1,
      eventCount: 1,
      proof: [{ kind: 'invoice.paid', filter: { doc_id: doc.id } }],
      reason: formatScoreReason({
        cash: balance,
        urgency: 1,
        confidence: 1,
        detail: `$${balance.toLocaleString()} overdue on ${doc.doc_number || 'invoice'}.`
      })
    })
  }

  const { data: clients } = await supabase
    .from('compass_clients')
    .select('id,name,deal_terms')
    .is('archived_at', null)

  for (const client of clients ?? []) {
    const terms = parseDealTerms(client.deal_terms)
    if (terms.status === 'contracted') {
      const { data: installInvoice } = await supabase
        .from('compass_qbo_docs')
        .select('id')
        .eq('client_id', client.id)
        .eq('doc_type', 'invoice')
        .limit(1)
        .maybeSingle()
      if (!installInvoice?.id) {
        const cash = terms.install_aud || 1997
        const fingerprint = `raise-install-invoice:${client.id}`
        if (!openFingerprints.has(fingerprint)) {
          candidates.push({
            key: fingerprint,
            title: `Raise install invoice · ${client.name}`,
            due: todayIsoDate(),
            href: `/clients/${client.id}`,
            cashAtStake: cash,
            urgency: 0.7,
            eventCount: 1,
            proof: [{ kind: 'invoice.created', filter: { client_id: client.id } }],
            reason: formatScoreReason({
              cash,
              urgency: 0.7,
              confidence: 1,
              detail: 'Contracted with no install invoice cached.'
            })
          })
        }
      }
    }

    if (terms.status === 'contracted' || terms.status === 'retainer_active') {
      if (terms.start_date && terms.monthly_aud > 0) {
        const { data: docs } = await supabase
          .from('compass_qbo_docs')
          .select('billing_period')
          .eq('client_id', client.id)
          .eq('invoice_kind', 'monthly')
        const periods = new Set(
          (docs ?? []).map((d) => String(d.billing_period || '')).filter(Boolean)
        )
        const due = monthlyPeriodsDue({
          startDate: terms.start_date,
          termDays: terms.term_days,
          todayYmd: todayIsoDate()
        })
        for (const period of due) {
          if (periods.has(period.billingPeriod)) continue
          const fingerprint = `retainer-invoice:${client.id}:${period.billingPeriod}`
          if (openFingerprints.has(fingerprint)) continue
          candidates.push({
            key: fingerprint,
            title: `Raise retainer · ${client.name} (${period.billingPeriod})`,
            due: period.periodDate,
            href: `/clients/${client.id}`,
            cashAtStake: terms.monthly_aud,
            urgency: 0.7,
            eventCount: 1,
            reason: formatScoreReason({
              cash: terms.monthly_aud,
              urgency: 0.7,
              confidence: 1,
              detail: `Retainer due ${period.periodDate} with no monthly invoice.`
            })
          })
        }
      }
    }
  }

  const { data: hotLeads } = await supabase
    .from('lead_contacts')
    .select('id,name,company,outbound_status')
    .in('outbound_status', ['replied', 'interested', 'meeting_booked'])
    .limit(50)
  for (const lead of hotLeads ?? []) {
    const fingerprint = `hot-lead:${lead.id}`
    if (openFingerprints.has(fingerprint)) continue
    candidates.push({
      key: fingerprint,
      title: `Follow up · ${lead.name || lead.company || lead.id}`,
      due: todayIsoDate(),
      href: `/inbox?lead=${encodeURIComponent(lead.id)}`,
      cashAtStake: 1997,
      urgency: 0.7,
      eventCount: 3,
      reason: formatScoreReason({
        cash: 1997,
        urgency: 0.7,
        confidence: 0.2,
        detail: `${lead.outbound_status} with no open follow-up task.`
      })
    })
  }

  const { data: liveCampaigns } = await supabase
    .from('compass_pipeline_campaigns')
    .select('id,name,instantly_campaign_id,copy_status,status')
    .not('instantly_campaign_id', 'is', null)
  for (const campaign of liveCampaigns ?? []) {
    const instantlyId = String(campaign.instantly_campaign_id || '').trim()
    if (!instantlyId) continue
    if (campaign.copy_status !== 'live' && campaign.status !== 'active') continue
    const r14 = campaignRatesFromEvents(allEvents, instantlyId, since14)
    const r90 = campaignRatesFromEvents(allEvents, instantlyId, since90)
    if (
      !campaignUnderperforming(
        r14.delivered,
        r14.positiveRate,
        r90.delivered,
        r90.positiveRate
      )
    ) {
      continue
    }
    const fingerprint = `campaign-underperform:${instantlyId}`
    if (openFingerprints.has(fingerprint)) continue
    candidates.push({
      key: fingerprint,
      title: `Review campaign · ${campaign.name}`,
      due: addDaysIso(3),
      href: `/sales/outbound/editor/live/${instantlyId}`,
      cashAtStake: 1997,
      urgency: 0.4,
      eventCount: r14.delivered,
      reason: formatScoreReason({
        cash: 1997,
        urgency: 0.4,
        confidence: Math.min(1, r14.delivered / 30),
        detail: `14d positive ${r14.positiveRate}% vs 90d baseline ${r90.positiveRate}% (${r14.delivered} delivered).`
      })
    })
  }

  if (inventory.uncontacted > 0 && winning) {
    const filters = new URLSearchParams({
      outbound_status: 'uncontacted',
      vertical: winning
    })
    if (inventory.topState) filters.set('state', inventory.topState)
    const fingerprint = `pull-next:${winning}:${inventory.topState || 'any'}`
    if (!openFingerprints.has(fingerprint)) {
      candidates.push({
        key: fingerprint,
        title: `Pull next: ${winning}${inventory.topState ? ` · ${inventory.topState}` : ''}`,
        due: addDaysIso(2),
        href: `/leads?${filters.toString()}`,
        cashAtStake: 1997,
        urgency: 0.4,
        eventCount: inventory.uncontacted,
        reason: formatScoreReason({
          cash: 1997,
          urgency: 0.4,
          confidence: Math.min(1, inventory.uncontacted / 30),
          detail: `${inventory.uncontacted.toLocaleString()} uncontacted in winning vertical ${winning}.`
        })
      })
    }
  }

  const ranked = rankActions(candidates, 5)
  return ranked.map((row) => ({
    key: row.key,
    title: row.title,
    due: row.due,
    reason: row.reason,
    href: row.href,
    score: row.score,
    fingerprint: row.key,
    proof: row.proof
  }))
}

/** Match open proof tasks, auto-complete when all clauses pass. */
export async function runEvidenceMatching(supabase: SupabaseClient): Promise<{
  completed: DigestCompletedItem[]
  partial: DigestPartialItem[]
}> {
  const since = '1970-01-01T00:00:00.000Z'
  const events = await listEvidence(supabase, { since })
  const { data: tasks, error } = await supabase
    .from('compass_tasks')
    .select('id,title,status,due,execution_contract')
    .neq('status', 'completed')
    .neq('status', 'cancelled')
  if (error) throw new Error(error.message)

  const completed: DigestCompletedItem[] = []
  const partial: DigestPartialItem[] = []
  const stamp = new Date().toISOString()

  for (const task of (tasks ?? []) as OpenTaskRow[]) {
    const contract = parseExecutionContract(task.execution_contract)
    if (!contract.proof?.length) continue

    const match = matchTaskProof(contract, events)
    if (match.allPass) {
      const evidence_ids = [...new Set(match.satisfied.flatMap((s) => s.evidence_ids))]
      const next: ExecutionContract = {
        ...contract,
        satisfied: match.satisfied,
        digest_undo: { completed_at: stamp, previous_status: task.status }
      }
      await supabase
        .from('compass_tasks')
        .update({
          status: 'completed',
          execution_contract: stringifyExecutionContract(next),
          updated_at: stamp
        })
        .eq('id', task.id)
      completed.push({
        task_id: task.id,
        title: task.title,
        evidence_ids,
        why: `All ${contract.proof.length} proof group(s) satisfied.`
      })
      continue
    }

    if (match.satisfied.length > 0) {
      const next: ExecutionContract = { ...contract, satisfied: match.satisfied }
      await supabase
        .from('compass_tasks')
        .update({
          execution_contract: stringifyExecutionContract(next),
          updated_at: stamp
        })
        .eq('id', task.id)
      partial.push({
        task_id: task.id,
        title: task.title,
        satisfied: match.satisfied,
        missing: match.partial
      })
    }
  }

  return { completed, partial }
}

export async function generateDailyDigest(supabase: SupabaseClient): Promise<DailyDecisionDigest> {
  const watermark = await loadPollerWatermark(supabase)
  await pollDerivedEvidence(supabase, watermark)
  await savePollerWatermark(supabase, new Date().toISOString())

  const { completed, partial } = await runEvidenceMatching(supabase)
  const proposed = await buildProposedTasks(supabase)

  const digest: DailyDecisionDigest = {
    generatedAt: new Date().toISOString(),
    completed,
    partial,
    proposed,
    needs_you: []
  }

  await upsertSyncSnapshot(supabase, DIGEST_SNAPSHOT_ID, digest, 'live')
  return digest
}

export async function loadDailyDigest(
  supabase: SupabaseClient
): Promise<DailyDecisionDigest | null> {
  const snap = await loadSyncSnapshot<DailyDecisionDigest>(supabase, DIGEST_SNAPSHOT_ID)
  return snap?.payload ?? null
}

/**
 * Cheap incremental refresh for app load (events since last digest).
 * Snapshot and event writes need the service-role client (RLS on
 * compass_sync_snapshots blocks operator-session inserts), so the refresh
 * runs on the admin client regardless of which client the caller holds.
 */
export async function refreshEvidenceIfStale(_supabase: SupabaseClient): Promise<void> {
  const admin = getPortalAdminClient()
  const digestSnap = await loadSyncSnapshot<DailyDecisionDigest>(admin, DIGEST_SNAPSHOT_ID)
  const existing = digestSnap?.payload
  const ageMs = existing?.generatedAt
    ? Date.now() - Date.parse(existing.generatedAt)
    : Number.POSITIVE_INFINITY
  if (ageMs < 5 * 60_000) return

  const since = existing?.generatedAt ?? (await loadPollerWatermark(admin))
  await pollDerivedEvidence(admin, since)
  await savePollerWatermark(admin, new Date().toISOString())
  const { completed, partial } = await runEvidenceMatching(admin)
  const proposed =
    existing?.proposed && existing.proposed.length > 0
      ? existing.proposed
      : await buildProposedTasks(admin)
  const merged: DailyDecisionDigest = {
    generatedAt: new Date().toISOString(),
    completed: [...(existing?.completed ?? []), ...completed],
    partial,
    proposed,
    needs_you: existing?.needs_you ?? []
  }
  await upsertSyncSnapshot(admin, DIGEST_SNAPSHOT_ID, merged, 'live')
}

export async function undoDigestCompletion(
  supabase: SupabaseClient,
  taskId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: task, error } = await supabase
    .from('compass_tasks')
    .select('id,status,execution_contract')
    .eq('id', taskId)
    .maybeSingle()
  if (error || !task) return { ok: false, error: 'task_not_found' }

  const contract = parseExecutionContract(task.execution_contract)
  const undo = contract.digest_undo
  if (!undo) return { ok: false, error: 'not_digest_completed' }

  const next: ExecutionContract = { ...contract }
  delete next.digest_undo

  const { error: updateError } = await supabase
    .from('compass_tasks')
    .update({
      status: undo.previous_status || 'in-progress',
      execution_contract: stringifyExecutionContract(next),
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId)
  if (updateError) return { ok: false, error: updateError.message }
  return { ok: true }
}

export { DIGEST_SNAPSHOT_ID }
