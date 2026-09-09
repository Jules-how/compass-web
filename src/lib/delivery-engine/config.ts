import { z } from 'zod'
import type { AccountConfig, DeliveryState } from './types'

const hhmm = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
export const configSchema = z.object({
  businessName: z.string().trim().min(1).max(120),
  timezone: z.string().refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false } }, 'Invalid timezone'),
  service: z.literal('ducted_replacement'),
  suburbs: z.array(z.string().trim().min(2).max(80)).min(1).max(200),
  owner: z.string().trim().min(1).max(120),
  hours: z.record(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']), z.union([z.tuple([hhmm, hhmm]), z.tuple([])]))
    .refine(hours => Object.values(hours).every(h => !h.length || h[0] < h[1]), 'Closing time must follow opening time'),
  slotMinutes: z.number().int().min(15).max(240), bufferMinutes: z.number().int().min(0).max(180),
  minimumNoticeMinutes: z.number().int().min(30).max(10080),
  followupHours: z.array(z.number().int().min(1).max(720)).max(3).refine(a => a.every((v, i) => i === 0 || v > a[i - 1]), 'Follow-ups must be spaced in ascending order'),
  quietHours: z.tuple([z.number().int().min(0).max(23), z.number().int().min(1).max(24)])
    .refine(([start, end]) => start < end, 'Contact window must end after it starts')
})

export const demoConfig: AccountConfig = {
  businessName: 'Demo Air Conditioning', timezone: 'Australia/Sydney', service: 'ducted_replacement',
  suburbs: ['Ryde', 'Parramatta', 'Eastwood'], owner: 'Demo office',
  hours: { mon: ['09:00', '17:00'], tue: ['09:00', '17:00'], wed: ['09:00', '17:00'], thu: ['09:00', '17:00'], fri: ['09:00', '17:00'], sat: [], sun: [] },
  slotMinutes: 60, bufferMinutes: 30, minimumNoticeMinutes: 120, followupHours: [24, 72], quietHours: [9, 18]
}

export function initialState(): DeliveryState {
  return { stage: 'new', facts: {}, offeredSlots: [], followups: 0, milestones: {}, automationVersion: 'installation-v1' }
}

export function normalizeMobile(phone: string): string {
  const digits = phone.trim().replace(/[\s()\-]/g, '')
  const normal = digits.startsWith('04') ? `+61${digits.slice(1)}` : digits.startsWith('614') ? `+${digits}` : digits
  if (!/^\+614\d{8}$/.test(normal)) throw new Error('An Australian mobile number is required')
  return normal
}

export const intakeSchema = z.object({
  accountId: z.string().uuid(), externalId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(120), phone: z.string().transform((value, ctx) => {
    try { return normalizeMobile(value) } catch { ctx.addIssue({ code: 'custom', message: 'An Australian mobile number is required' }); return z.NEVER }
  }),
  facts: z.object({ suburb: z.string().max(80).optional(), service: z.string().max(120).optional(), homeowner: z.boolean().optional(), timeframe: z.string().max(120).optional(), address: z.string().max(240).optional() }).strict().default({}),
  consent: z.object({ sms: z.boolean(), wording: z.string().min(1).max(2000), source: z.string().min(1).max(300), recordedAt: z.iso.datetime({ offset: true }) }).strict(),
  attribution: z.object({ source: z.enum(['google_search', 'website', 'phone', 'meta']), campaign: z.string().max(200).optional(), keyword: z.string().max(200).optional(), gclid: z.string().max(500).optional(), gbraid: z.string().max(500).optional(), wbraid: z.string().max(500).optional(), landingPage: z.string().url().max(1000).optional() }).strict()
}).strict()

export function isOptOut(body: string): boolean {
  body = body.replaceAll('’', "'")
  return /^(?:please\s+)?(stop|stopall|unsubscribe|cancel|end|quit|opt\s*out)(?:\s+(?:please|thanks|thank you))?[.!\s]*$/i.test(body.trim()) ||
    /\b(stop (?:texting|messaging|contacting)|do(?:n't| not) (?:text|message|contact)|remove me|unsubscribe me|no more (?:texts|messages))\b/i.test(body)
}
