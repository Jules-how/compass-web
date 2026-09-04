import type { SupabaseClient } from '@supabase/supabase-js'

import { loadDailyDigest, type DailyDecisionDigest } from '@/lib/evidence-poller'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { loadSyncSnapshot } from '@/lib/sync-snapshots'
import {
  clientStagesInOrder,
  leadStagesInOrder,
  stageToolHref,
  type ClientPipelineStage,
  type LeadPipelineStage
} from '@/lib/pipeline-spine'
import type { ColdEmailGlance } from '@/lib/home-demo-data'
import type { CompassTask } from '@/lib/types'
import { taskHasProofClauses, proofProgress } from '@/lib/execution-contract'
import { isOpenTask } from '@/lib/task-organisation'
import type { MorningWavePayload } from '@/lib/wave-morning'
import { countRowsByValue } from '@/lib/pipeline-spine'
import { loadMorningWavePayload } from '@/lib/wave-morning-server'

export type SpineStageCount = {
  stage: string
  count: number
  href: string
}

export type PullNextCard = {
  vertical: string
  state: string | null
  uncontacted: number
  winningVertical: string | null
  href: string
  agentQuery: string
}

export type HomePayload = {
  digest: DailyDecisionDigest | null
  coldEmail: ColdEmailGlance | null
  coldEmailSource: 'instantly' | 'demo' | 'error'
  spine: {
    leads: SpineStageCount[]
    clients: SpineStageCount[]
  }
  pullNext: PullNextCard | null
  inFlight: Array<{
    id: string
    title: string
    proven: number
    total: number
    status: string
  }>
  overdueTasks: Array<{ id: string; title: string; due: string | null }>
  liveCampaignCount: number
  wave: MorningWavePayload | null
}

async function buildPullNext(): Promise<PullNextCard | null> {
  const { data, error } = await getPortalAdminClient().rpc('lead_inventory_aggregate', {
    p_vertical: null
  })
  if (error || !data) return null

  type Row = {
    vertical: string
    outbound_status: string
    state: string
    email_usable: boolean
    n: number
  }

  let uncontacted = 0
  const byVertical = new Map<string, number>()
  const byState = new Map<string, number>()

  for (const row of data as Row[]) {
    if (row.outbound_status === 'uncontacted' && row.email_usable) {
      uncontacted += Number(row.n)
      byVertical.set(row.vertical, (byVertical.get(row.vertical) ?? 0) + Number(row.n))
      if (row.state && row.state !== '(blank)') {
        byState.set(row.state, (byState.get(row.state) ?? 0) + Number(row.n))
      }
    }
  }

  if (uncontacted === 0) return null

  let vertical: string | null = null
  let max = 0
  for (const [v, count] of byVertical) {
    if (count > max) {
      vertical = v
      max = count
    }
  }
  if (!vertical) return null

  let state: string | null = null
  let stateMax = 0
  for (const [s, count] of byState) {
    if (count > stateMax) {
      state = s
      stateMax = count
    }
  }

  const filters = new URLSearchParams({ outbound_status: 'uncontacted', vertical })
  if (state) filters.set('state', state)

  return {
    vertical,
    state,
    uncontacted,
    winningVertical: vertical,
    href: `/leads?${filters.toString()}`,
    agentQuery: `uncontacted ${vertical}${state ? ` in ${state}` : ''} with email`
  }
}

export async function loadHomePayload(supabase: SupabaseClient): Promise<HomePayload> {
  const [digest, coldSnap, tasksRes, leadSpine, clientSpine, pullNext, wave] = await Promise.all([
    loadDailyDigest(supabase),
    loadSyncSnapshot<ColdEmailGlance>(supabase, 'instantly_cold_email'),
    supabase
      .from('compass_tasks')
      .select('id,title,status,due,execution_contract,parent_task_id')
      .is('parent_task_id', null)
      .order('updated_at', { ascending: false })
      .limit(200),
    countRowsByValue(supabase, 'lead_contacts', 'pipeline_stage', [...leadStagesInOrder()], (stage) =>
      stageToolHref(stage as LeadPipelineStage)
    ),
    countRowsByValue(
      supabase,
      'compass_clients',
      'pipeline_stage',
      [...clientStagesInOrder()],
      (stage) => stageToolHref(stage as ClientPipelineStage)
    ),
    buildPullNext(),
    loadMorningWavePayload(supabase, 0, { instantlyBoard: false }).catch(() => null)
  ])

  const tasks = (tasksRes.data ?? []) as CompassTask[]
  const open = tasks.filter(isOpenTask)
  const inFlight = open
    .filter((t) => taskHasProofClauses(t))
    .map((t) => {
      const { proven, total } = proofProgress(t)
      return { id: t.id, title: t.title, proven, total, status: t.status }
    })
    .filter((t) => t.total > 0 && t.proven < t.total)

  const overdueTasks = open
    .filter((t) => t.due && Date.parse(t.due) < Date.now())
    .slice(0, 8)
    .map((t) => ({ id: t.id, title: t.title, due: t.due }))

  const cold = coldSnap?.payload ?? null
  const liveCampaignCount = cold?.campaigns?.filter((c) => c.status === 'live').length ?? 0

  return {
    digest,
    coldEmail: cold,
    coldEmailSource: coldSnap ? 'instantly' : 'demo',
    spine: { leads: leadSpine, clients: clientSpine },
    pullNext,
    inFlight,
    overdueTasks,
    liveCampaignCount,
    wave: wave
      ? { ...wave, instantlyRepliesWaiting: cold?.repliesWaiting ?? wave.instantlyRepliesWaiting }
      : null
  }
}
