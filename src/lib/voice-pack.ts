import 'server-only'

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'

const URGENCY_VALUES = ['today', 'this_week', 'flexible'] as const

const jobTypeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  aliases: z.array(z.string().min(1)).min(1),
  bookable: z.boolean()
})

const tradePackSchema = z.object({
  pack_id: z.string().regex(/^[a-z_]+$/),
  locale: z.literal('en-AU'),
  agent_display_name: z.string().min(1),
  timezone: z.string().min(1),
  begin_message: z.string().min(1),
  recording_disclosure: z.string().min(1),
  recording_refusal_message: z.string().min(1),
  job_types: z.array(jobTypeSchema).min(1),
  qualify_extra: z.array(z.string()).optional().default([]),
  urgency_values: z
    .array(z.enum(URGENCY_VALUES))
    .length(3)
    .refine(
      (values) =>
        values.includes('today') && values.includes('this_week') && values.includes('flexible'),
      'urgency_values must include today, this_week, flexible'
    ),
  booking_rules: z.object({
    slot_minutes: z.number().int().min(15),
    buffer_minutes: z.number().int().min(0),
    same_day_cutoff_hour: z.number().int().min(0).max(23),
    hours: z.record(z.string(), z.array(z.string()).length(2))
  }),
  escalation: z.object({
    callback_phrase: z.string().min(1),
    calendar_broken_phrase: z.string().min(1),
    emergency: z.object({
      triggers: z.array(z.string().min(1)).min(1),
      safety_line: z.string().min(1),
      advise_000: z.boolean().optional(),
      advise_utility: z.string().optional(),
      owner_alert_immediate: z.boolean()
    })
  }),
  sms: z.object({
    recovery: z.string().min(1),
    confirm: z.string().min(1),
    inbound_opener: z.string().min(1),
    stop_ack: z.string().min(1)
  }),
  transfer: z.object({
    allowed: z.boolean(),
    default_enabled: z.boolean(),
    phrase: z.string().min(1)
  }),
  post_call_outcomes: z.array(z.string().min(1)).min(1)
})

export type TradePack = z.infer<typeof tradePackSchema>
export type UrgencyValue = (typeof URGENCY_VALUES)[number]

const packCache = new Map<string, TradePack>()

function packDirectories(): string[] {
  const candidates = [
    process.env.VOICE_PACKS_DIR?.trim(),
    resolve(process.cwd(), 'voice-agents/packs'),
    resolve(process.cwd(), '../voice-agents/packs'),
    resolve(process.cwd(), '../../voice-agents/packs')
  ].filter((value): value is string => Boolean(value))
  return candidates.filter((dir) => existsSync(dir))
}

export function listPackIds(): string[] {
  for (const dir of packDirectories()) {
    try {
      const ids = readdirSync(dir)
        .filter((name) => name.endsWith('.json') && name !== 'schema.json')
        .map((name) => name.replace(/\.json$/, ''))
      if (ids.length) return ids.sort()
    } catch {
      /* try next */
    }
  }
  return []
}

export function loadTradePack(packId: string): TradePack {
  const cached = packCache.get(packId)
  if (cached) return cached

  let lastError: Error | null = null
  for (const dir of packDirectories()) {
    const path = join(dir, `${packId}.json`)
    if (!existsSync(path)) continue
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
      const pack = tradePackSchema.parse(raw)
      if (pack.pack_id !== packId) {
        throw new Error(`pack_id mismatch: expected ${packId}, got ${pack.pack_id}`)
      }
      packCache.set(packId, pack)
      return pack
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastError ?? new Error(`pack_not_found: ${packId}`)
}

export function validateTradePack(raw: unknown): TradePack {
  return tradePackSchema.parse(raw)
}

export function renderPackTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`)
}

export function renderPackSms(
  pack: TradePack,
  key: keyof TradePack['sms'],
  vars: { BusinessName: string; PublishedNumber?: string; weekday?: string; time?: string; suburb?: string }
): string {
  return renderPackTemplate(pack.sms[key], {
    BusinessName: vars.BusinessName,
    PublishedNumber: vars.PublishedNumber ?? '',
    weekday: vars.weekday ?? '',
    time: vars.time ?? '',
    suburb: vars.suburb ?? ''
  })
}

export function jobTypesSpokenList(pack: TradePack): string {
  return pack.job_types.map((jt) => jt.label).join(', ')
}

export function isEmergencyTrigger(pack: TradePack, text: string): boolean {
  const lower = text.toLowerCase()
  return pack.escalation.emergency.triggers.some((trigger) => lower.includes(trigger.toLowerCase()))
}

export function isNonBookableJobType(pack: TradePack, jobTypeId: string): boolean {
  const job = pack.job_types.find((jt) => jt.id === jobTypeId)
  return !job || !job.bookable
}

/** Exported for tests */
export { tradePackSchema, URGENCY_VALUES }
