import type { SupabaseClient } from '@supabase/supabase-js'

import { parseDealTerms } from '@/lib/qbo-deal'
import type { DealTerms } from '@/lib/qbo-types'
import type { VoiceCallRow } from '@/lib/types'

import {
  assembleBoard,
  buildDemoBoard,
  evaluateClient,
  jobContributionAud,
  weekWindows
} from './engine.mjs'
import { persistBoard } from './store'
import type { CsBoard, CsPaymentStatus } from './types'

type ClientRow = {
  id: string
  name: string
  industry: string | null
  main_contact_name: string | null
  last_touch_at: string | null
  deal_terms: unknown
  voice_config?: Record<string, unknown> | null
  archived_at?: string | null
  status?: string | null
  tags?: string[] | null
}

type IssueRow = {
  client_id: string
  status: string
  title?: string | null
}

type SnapshotRow = {
  client_id: string
  score: number
  scored_at: string
}

type ArtifactRow = {
  client_id: string
  kind: string
  created_at: string
}

function inRange(iso: string | null | undefined, start: Date, end: Date): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= start.getTime() && t <= end.getTime()
}

function callBooked(call: VoiceCallRow): boolean {
  return (call.outcome || '').toLowerCase() === 'booked'
}

function callShowed(call: VoiceCallRow, now: Date): boolean {
  if (!callBooked(call)) return false
  if (call.payload && call.payload.showed === true) return true
  if (!call.slot_start || !call.calendar_event_id) return false
  return new Date(call.slot_start).getTime() <= now.getTime()
}

function paymentFromDealAndDocs(
  terms: DealTerms,
  docs: Array<{ due_date?: string | null; balance?: number }>,
  now: Date
): CsPaymentStatus {
  if (terms.status === 'paused') return 'paused'
  if (terms.status === 'ended') return 'ended'
  if (terms.status === 'draft') return 'draft'
  const unpaid = docs.filter((doc) => (Number(doc.balance) || 0) > 0)
  const overdue = unpaid.some((doc) => doc.due_date && new Date(doc.due_date).getTime() < now.getTime())
  if (overdue) return 'overdue'
  const soon = unpaid.some((doc) => {
    if (!doc.due_date) return false
    const days = (new Date(doc.due_date).getTime() - now.getTime()) / 86_400_000
    return days >= 0 && days <= 7
  })
  if (soon) return 'due_soon'
  return 'current'
}

function tablesMissing(error: { message?: string } | null): boolean {
  const msg = (error?.message || '').toLowerCase()
  return msg.includes('does not exist') || msg.includes('could not find the table') || msg.includes('schema cache')
}

export async function gatherLiveClients(
  supabase: SupabaseClient,
  now = new Date()
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabase
    .from('compass_clients')
    .select('id,name,industry,main_contact_name,last_touch_at,deal_terms,voice_config,archived_at,status,tags')
    .is('archived_at', null)
    .in('status', ['active', 'paused', 'onboarding'])

  if (error) throw new Error(error.message)
  const clients = ((data ?? []) as ClientRow[]).filter((row) => !(row.tags || []).includes('cs-demo'))
  if (clients.length === 0) return []

  const ids = clients.map((row) => row.id)
  const windows = weekWindows(now)

  const [callsRes, issuesRes, docsRes, priorRes, qbrRes] = await Promise.all([
    supabase
      .from('compass_voice_calls')
      .select(
        'id,client_id,started_at,outcome,slot_start,calendar_event_id,payload'
      )
      .in('client_id', ids)
      .gte('started_at', windows.priorStartIso),
    supabase
      .from('compass_client_issues')
      .select('client_id,status,title')
      .in('client_id', ids),
    supabase
      .from('compass_qbo_docs')
      .select('client_id,due_date,balance,doc_type')
      .in('client_id', ids),
    supabase
      .from('compass_cs_snapshots')
      .select('client_id,score,scored_at')
      .in('client_id', ids)
      .order('scored_at', { ascending: false }),
    supabase
      .from('compass_cs_artifacts')
      .select('client_id,kind,created_at')
      .eq('kind', 'qbr')
      .in('client_id', ids)
      .order('created_at', { ascending: false })
  ])

  if (callsRes.error) throw new Error(callsRes.error.message)
  if (issuesRes.error) throw new Error(issuesRes.error.message)

  const priorByClient = new Map<string, number>()
  for (const row of (priorRes.data ?? []) as SnapshotRow[]) {
    if (!priorByClient.has(row.client_id)) priorByClient.set(row.client_id, row.score)
  }
  const lastQbrByClient = new Map<string, string>()
  for (const row of (qbrRes.data ?? []) as ArtifactRow[]) {
    if (!lastQbrByClient.has(row.client_id)) lastQbrByClient.set(row.client_id, row.created_at)
  }

  const calls = (callsRes.data ?? []) as VoiceCallRow[]
  const issues = (issuesRes.data ?? []) as IssueRow[]
  const docs = (docsRes.error ? [] : (docsRes.data ?? [])) as Array<{
    client_id: string
    display_state?: string
    due_date?: string | null
    balance?: number
    doc_type?: string
  }>

  return clients.map((client) => {
    const terms = parseDealTerms(client.deal_terms)
    const clientCalls = calls.filter((call) => call.client_id === client.id)
    const thisCalls = clientCalls.filter((call) => inRange(call.started_at, windows.thisStart, windows.end))
    const lastCalls = clientCalls.filter((call) => inRange(call.started_at, windows.priorStart, windows.thisStart))
    const bookedThis = thisCalls.filter(callBooked).length
    const bookedLast = lastCalls.filter(callBooked).length
    const showedThis = thisCalls.filter((call) => callShowed(call, now)).length
    const showedLast = lastCalls.filter((call) => callShowed(call, now)).length
    const showedToDate = clientCalls.filter((call) => callShowed(call, now)).length
    const clientIssues = issues.filter((issue) => issue.client_id === client.id)
    const open = clientIssues.filter((issue) => issue.status !== 'completed' && issue.status !== 'cancelled')
    const blocked = open.filter((issue) => issue.status === 'blocked')
    const complaints = clientIssues.filter((issue) => /complaint|angry|refund/i.test(issue.title || '')).length
    const clientDocs = docs.filter((doc) => doc.client_id === client.id)
    const voice = (client.voice_config || {}) as Record<string, unknown>
    const daysSince = client.last_touch_at ? Math.floor((now.getTime() - new Date(client.last_touch_at).getTime()) / 86_400_000) : null

    return {
      id: client.id,
      name: client.name,
      city: null,
      trade: client.industry,
      ownerName: client.main_contact_name,
      ownerMobile: typeof voice.owner_mobile === 'string' ? voice.owner_mobile : null,
      isDemo: (client.tags || []).includes('cs-demo'),
      callsThis: thisCalls.length,
      callsLast: lastCalls.length,
      bookedThis,
      bookedLast,
      showedThis,
      showedLast,
      showedToDate,
      daysSinceOwnerEngaged: daysSince,
      paymentStatus: paymentFromDealAndDocs(terms, clientDocs, now),
      openIssues: open.length,
      blockedIssues: blocked.length,
      complaints,
      startDate: terms.start_date,
      lastQbrAt: lastQbrByClient.get(client.id) || null,
      feesPaid: terms.install_aud,
      jobContributionAud: jobContributionAud(client.industry, (terms as DealTerms & { job_contribution_aud?: number }).job_contribution_aud),
      priorScore: priorByClient.get(client.id) ?? null
    }
  })
}

export async function runCsDept(
  supabase: SupabaseClient | null,
  options: { now?: Date; includeDemo?: boolean; persist?: boolean } = {}
): Promise<CsBoard> {
  const now = options.now ?? new Date()
  const persist = options.persist !== false
  let liveInputs: Array<Record<string, unknown>> = []

  if (supabase) {
    try {
      liveInputs = await gatherLiveClients(supabase, now)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!tablesMissing({ message }) && !/compass_cs_/.test(message)) throw err
      liveInputs = []
    }
  }

  const includeDemo = options.includeDemo ?? liveInputs.length === 0
  const liveResults = liveInputs.map((row) => evaluateClient(row, now))
  const demoBoard = includeDemo ? buildDemoBoard(now) : null
  const demoResults = demoBoard?.cards ?? []

  const merged = assembleBoard([...liveResults, ...demoResults], now)
  const source =
    liveResults.length > 0 && demoResults.length > 0 ? 'mixed' : liveResults.length > 0 ? 'live' : 'demo'
  const board: CsBoard = { ...merged, source }

  if (supabase && persist) {
    try {
      await persistBoard(supabase, board, now)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!tablesMissing({ message })) throw err
    }
  }

  return board
}

export function demoBoardForInspect(): CsBoard {
  return buildDemoBoard() as CsBoard
}
