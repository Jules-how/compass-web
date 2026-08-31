import 'server-only'

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type ReactivationSegment = {
  id: string
  label: string
  min_days: number
  max_days: number | null
}

export type ReactivationTouch = {
  touch_index: number
  channel: 'sms' | 'email'
  day_offset: number
  template_id: string
  template: string
}

export type ReactivationPack = {
  pack_id: string
  icp: string
  description?: string
  import_map: Record<string, string[]>
  consent_policy: {
    allowed_bases: string[]
    max_inferred_age_days: number
    comment?: string
  }
  segments: ReactivationSegment[]
  lapse_floor_days: number
  sequence: ReactivationTouch[]
  escalation_rules: Record<
    string,
    {
      action: 'suppress' | 'escalate'
      event: string
      keywords?: string[]
      task_title?: string
      priority?: string
    }
  >
  caps: {
    max_touches: number
    monthly_contact_cap: number
  }
  compliance_gate: {
    licensee_signoff_required?: boolean
    advice_preserving?: boolean
    prohibited_topics?: string[]
  }
  bonus_metric: 'attended_meeting' | 'showed_booking'
  quiet_hours: { start: string; end: string }
  stop_ack_template: string
}

const packCache = new Map<string, ReactivationPack>()

function packDirectories(): string[] {
  const candidates = [
    process.env.REACTIVATION_PACKS_DIR?.trim(),
    resolve(process.cwd(), 'database-reactivation/packs'),
    resolve(process.cwd(), '../database-reactivation/packs'),
    resolve(process.cwd(), '../../database-reactivation/packs')
  ].filter((value): value is string => Boolean(value))
  return candidates.filter((dir) => existsSync(dir))
}

export function listReactivationPackIds(): string[] {
  const dir = packDirectories()[0]
  if (!dir) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''))
    .sort()
}

export function loadReactivationPack(packId: string): ReactivationPack {
  const cached = packCache.get(packId)
  if (cached) return cached

  for (const dir of packDirectories()) {
    const path = join(dir, `${packId}.json`)
    if (!existsSync(path)) continue
    const raw = JSON.parse(readFileSync(path, 'utf8')) as ReactivationPack
    if (raw.pack_id !== packId) {
      throw new Error(`pack_id mismatch: ${raw.pack_id} !== ${packId}`)
    }
    packCache.set(packId, raw)
    return raw
  }
  throw new Error(`reactivation_pack_not_found:${packId}`)
}

export const REACTIVATION_PACK_IDS = [
  'brokers_dead_leads',
  'dental',
  'physio',
  'trades'
] as const
