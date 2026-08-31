import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { probeCalendarGrant } from '@/lib/booking'
import { parseDealTerms } from '@/lib/qbo-deal'
import type { ClientVoiceConfig } from '@/lib/types'
import { provisionVoiceClient } from '@/lib/voice-provision'
import {
  applyNumberStrategy,
  boardColumns,
  capacity,
  completeStep,
  createInstall,
  currentStepId,
  hydrateFromVoice,
  loadPipeline,
  renderSms,
  setBlocked
} from './orchestrator.mjs'
import { buildDemoInstalls, demoNow } from './demo.mjs'
import {
  createSopPlanFromLegacySteps,
  createDefaultSopPlan,
  normalizeSopPlan,
  type SopPlan
} from './sop-template'
import { loadSopTemplate } from './sop-storage'
import { runTestCallScenarios } from './voice-lab.mjs'

type InstallRecord = ReturnType<typeof createInstall> & { sopPlan?: SopPlan }

const demoState = new Map<string, InstallRecord>()
let demoSeeded = false

function seedDemo() {
  if (demoSeeded) return
  for (const install of buildDemoInstalls()) {
    demoState.set(install.id, install)
  }
  demoSeeded = true
}

export function resetDemoInstalls() {
  demoState.clear()
  demoSeeded = false
  seedDemo()
}

function deliveryOf(dealTerms: unknown): Record<string, unknown> {
  const terms = (dealTerms && typeof dealTerms === 'object' ? dealTerms : {}) as Record<string, unknown>
  const delivery = terms.delivery
  return delivery && typeof delivery === 'object' ? (delivery as Record<string, unknown>) : {}
}

function ensureSopPlan(install: InstallRecord, template = createDefaultSopPlan()): InstallRecord {
  if (install.sopPlan) {
    try {
      install.sopPlan = normalizeSopPlan(install.sopPlan)
      return install
    } catch {
      // Fall through to a safe plan derived from the legacy install state.
    }
  }
  install.sopPlan = createSopPlanFromLegacySteps(install.steps, template)
  return install
}

export function ensureInstallFromDelivery(
  client: { id: string; name: string; deal_terms?: unknown; voice?: unknown },
  at = new Date().toISOString(),
  template = createDefaultSopPlan()
): InstallRecord {
  const delivery = deliveryOf(client.deal_terms)
  const existing = delivery.install as InstallRecord | undefined
  if (existing?.id && existing.steps) {
    const install = hydrateFromVoice(existing, (client.voice || {}) as ClientVoiceConfig, at)
    return ensureSopPlan(install, template)
  }
  const install = createInstall(
    {
      id: `install-${client.id}`,
      source: 'live',
      clientId: client.id,
      business: String(delivery.trading_name || client.name || ''),
      ownerName: String(delivery.owner_name || ''),
      ownerMobile: String(delivery.owner_mobile || ''),
      trade: String(delivery.trade || ''),
      publishedNumber: String(delivery.public_number || ''),
      carrier: String(delivery.carrier || ''),
      lineType: String(delivery.line_type || ''),
      calendarId: String(delivery.google_calendar_id || ''),
      voice: (client.voice || {}) as ClientVoiceConfig
    },
    String(delivery.onboarding_submitted_at || at)
  )
  completeStep(install, 'intake_form', at)
  hydrateFromVoice(install, (client.voice || {}) as ClientVoiceConfig, at)
  return ensureSopPlan(install, template)
}

async function saveLiveInstall(supabase: SupabaseClient, clientId: string, install: InstallRecord) {
  const { data, error } = await supabase
    .from('compass_clients')
    .select('deal_terms')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const terms = parseDealTerms(data?.deal_terms)
  const delivery = deliveryOf(data?.deal_terms)
  const next = {
    ...terms,
    delivery: { ...delivery, install }
  }
  const { error: updateError } = await supabase
    .from('compass_clients')
    .update({ deal_terms: next, updated_at: new Date().toISOString() })
    .eq('id', clientId)
  if (updateError) throw new Error(updateError.message)
}

async function loadLiveInstalls(supabase: SupabaseClient, template: SopPlan): Promise<InstallRecord[]> {
  const { data, error } = await supabase
    .from('compass_clients')
    .select('id,name,voice,deal_terms,archived_at')
    .is('archived_at', null)
    .limit(40)
  if (error) throw new Error(error.message)
  const out: InstallRecord[] = []
  for (const row of data ?? []) {
    const delivery = deliveryOf(row.deal_terms)
    const hasForm = Boolean(delivery.onboarding_submitted_at || delivery.install)
    if (!hasForm) continue
    const install = ensureInstallFromDelivery(row, undefined, template)
    out.push(install)
    if (!delivery.install) {
      await saveLiveInstall(supabase, row.id, install)
    }
  }
  return out
}

function getDemo(id: string): InstallRecord {
  seedDemo()
  const install = demoState.get(id)
  if (!install) throw new Error('not_found')
  return install
}

export async function listInstallBoard(supabase: SupabaseClient, source = 'all') {
  seedDemo()
  const sopTemplate = await loadSopTemplate(supabase)
  const now = source === 'demo' ? demoNow() : new Date().toISOString()
  const live = source === 'demo' ? [] : await loadLiveInstalls(supabase, sopTemplate)
  const demo =
    source === 'live'
      ? []
      : [...demoState.values()].map((install) => ensureSopPlan(install, sopTemplate))
  const installs = [...live, ...demo]
  return {
    now,
    pipeline: loadPipeline(),
    sopTemplate,
    columns: boardColumns(installs, now),
    capacity: capacity(installs),
    smsById: Object.fromEntries(installs.map((install) => [install.id, renderSms(install)]))
  }
}

export async function getInstall(supabase: SupabaseClient, id: string) {
  if (id.startsWith('demo-')) {
    const install = ensureSopPlan(getDemo(id), await loadSopTemplate(supabase))
    return { install, sms: renderSms(install), now: demoNow() }
  }
  const sopTemplate = await loadSopTemplate(supabase)
  const { data, error } = await supabase
    .from('compass_clients')
    .select('id,name,voice,deal_terms')
    .eq('id', id.replace(/^install-/, ''))
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) {
    const byInstall = await supabase
      .from('compass_clients')
      .select('id,name,voice,deal_terms')
      .is('archived_at', null)
      .limit(40)
    const match = (byInstall.data ?? []).find((row) => {
      const delivery = deliveryOf(row.deal_terms)
      return (delivery.install as { id?: string } | undefined)?.id === id
    })
    if (!match) throw new Error('not_found')
    const install = ensureInstallFromDelivery(match, undefined, sopTemplate)
    return { install, sms: renderSms(install), now: new Date().toISOString() }
  }
  const install = ensureInstallFromDelivery(data, undefined, sopTemplate)
  return { install, sms: renderSms(install), now: new Date().toISOString() }
}

async function persist(supabase: SupabaseClient, install: InstallRecord) {
  if (install.source === 'demo') {
    demoState.set(install.id, install)
    return install
  }
  if (!install.clientId) throw new Error('missing_client')
  await saveLiveInstall(supabase, install.clientId, install)
  return install
}

export async function mutateInstall(
  supabase: SupabaseClient,
  id: string,
  action: string,
  body: Record<string, unknown> = {}
) {
  const loaded = await getInstall(supabase, id)
  const install = loaded.install
  const at = new Date().toISOString()

  if (action === 'complete') {
    completeStep(install, String(body.stepId || currentStepId(install)), at, {
      checkpointId: body.checkpointId,
      liveAt: body.liveAt
    })
  } else if (action === 'block') {
    setBlocked(install, String(body.stepId || currentStepId(install)), String(body.blockedOn || 'owner'))
  } else if (action === 'unblock') {
    setBlocked(install, String(body.stepId || currentStepId(install)), null)
  } else if (action === 'choose_strategy') {
    applyNumberStrategy(install, body, at)
  } else if (action === 'run_lab') {
    const result = await runTestCallScenarios({
      packId: install.packId,
      limit: Number(body.limit || 12)
    })
    const { recordTestCall } = await import('./orchestrator.mjs')
    recordTestCall(install, result, at)
    await persist(supabase, install)
    return { install, sms: renderSms(install), lab: result }
  } else if (action === 'provision') {
    if (install.source === 'demo') {
      hydrateFromVoice(
        install,
        {
          twilio_number: '+61480001999',
          retell_agent_id: 'agent_master_demo',
          trade_pack_id: install.packId,
          probe_ok: false,
          calendar_grant_broken: true
        },
        at
      )
    } else if (install.clientId) {
      const result = await provisionVoiceClient(supabase, {
        clientId: install.clientId,
        tradePackId: String(install.packId || body.packId || ''),
        calendarId: String(install.calendarId || body.calendarId || ''),
        carrier: (install.carrier as 'telstra') || 'telstra',
        lineType: (install.lineType as 'mobile') || 'mobile',
        dryRun: body.dryRun === true
      })
      if (result.voice) hydrateFromVoice(install, result.voice, at)
      install.notes = [install.notes, result.steps.join(' · ')].filter(Boolean).join('\n')
    }
  } else if (action === 'probe') {
    if (install.source === 'demo') {
      hydrateFromVoice(install, { probe_ok: true, calendar_grant_broken: false }, at)
    } else if (install.calendarId) {
      const probe = await probeCalendarGrant(install.calendarId)
      hydrateFromVoice(
        install,
        { probe_ok: probe.ok, calendar_grant_broken: probe.grantBroken },
        at
      )
      if (install.clientId) {
        const { data } = await supabase.from('compass_clients').select('voice').eq('id', install.clientId).maybeSingle()
        const voice = { ...((data?.voice as ClientVoiceConfig) ?? {}), probe_ok: probe.ok, calendar_grant_broken: probe.grantBroken }
        await supabase.from('compass_clients').update({ voice }).eq('id', install.clientId)
      }
    }
  } else if (action === 'go_live') {
    completeStep(install, 'go_live', at, { liveAt: at })
    if (install.source !== 'demo' && install.clientId) {
      const { data } = await supabase.from('compass_clients').select('voice').eq('id', install.clientId).maybeSingle()
      const voice = { ...((data?.voice as ClientVoiceConfig) ?? {}), live_at: at }
      await supabase.from('compass_clients').update({ voice }).eq('id', install.clientId)
    }
  } else if (action === 'checkpoint') {
    completeStep(install, 'checkpoint', at, { checkpointId: body.checkpointId })
  } else if (action === 'save_sop_plan') {
    install.sopPlan = normalizeSopPlan(body.plan)
  } else if (action === 'reset_demo') {
    resetDemoInstalls()
    return getInstall(supabase, id)
  } else {
    throw new Error(`unknown_action:${action}`)
  }

  await persist(supabase, install)
  return { install, sms: renderSms(install) }
}

export async function spawnInstallOnSubmit(
  supabase: SupabaseClient,
  client: { id: string; name: string; deal_terms?: unknown; voice?: unknown }
) {
  const install = ensureInstallFromDelivery(client, new Date().toISOString(), await loadSopTemplate(supabase))
  await saveLiveInstall(supabase, client.id, install)
  return install
}
