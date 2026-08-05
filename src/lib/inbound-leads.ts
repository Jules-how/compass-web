import { createHash } from 'node:crypto'

export {
  INBOUND_LEAD_CHANNELS,
  INBOUND_LEAD_SOURCES,
  inboundSourceLabel,
  projectInboundLead,
  type InboundLeadChannel,
  type InboundLeadSource,
  type PortalInboundLead
} from './inbound-leads-ui'

import {
  INBOUND_LEAD_CHANNELS,
  INBOUND_LEAD_SOURCES,
  type InboundLeadChannel,
  type InboundLeadSource
} from './inbound-leads-ui'

export type InboundLeadIngestInput = {
  clientSlug: string
  externalId: string | null
  name: string
  email: string | null
  phone: string | null
  source: InboundLeadSource
  channel: InboundLeadChannel
  submittedAt: string
  summary: string | null
  raw: Record<string, unknown>
}

function clean(value: unknown, max: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

function optionalClean(value: unknown, max: number): string | null {
  const text = clean(value, max)
  return text ? text : null
}

function isSource(value: string): value is InboundLeadSource {
  return (INBOUND_LEAD_SOURCES as readonly string[]).includes(value)
}

function isChannel(value: string): value is InboundLeadChannel {
  return (INBOUND_LEAD_CHANNELS as readonly string[]).includes(value)
}

export function parseInboundLeadIngestBody(body: unknown): InboundLeadIngestInput | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'invalid_json' }
  const raw = body as Record<string, unknown>
  const clientSlug = clean(raw.client_slug ?? raw.clientSlug, 80).toLowerCase()
  const name = clean(raw.name, 180)
  const source = clean(raw.source, 40)
  const channel = clean(raw.channel, 20)
  if (!clientSlug || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(clientSlug)) return { error: 'invalid_client_slug' }
  if (!name) return { error: 'invalid_name' }
  if (!isSource(source)) return { error: 'invalid_source' }
  if (!isChannel(channel)) return { error: 'invalid_channel' }

  const submittedRaw = clean(raw.submitted_at ?? raw.submittedAt, 40)
  const submittedAt = submittedRaw || new Date().toISOString()
  if (Number.isNaN(Date.parse(submittedAt))) return { error: 'invalid_submitted_at' }

  const externalId = optionalClean(raw.external_id ?? raw.externalId, 240)
  const email = optionalClean(raw.email, 254)
  let phone = optionalClean(raw.phone, 40)
  if (phone && (phone.length < 5 || !/\d{5,}/.test(phone.replace(/\D/g, '')))) {
    phone = null
  }
  const summary = optionalClean(raw.summary, 2000)
  const rawPayload =
    raw.raw && typeof raw.raw === 'object' && !Array.isArray(raw.raw)
      ? (raw.raw as Record<string, unknown>)
      : {}

  return {
    clientSlug,
    externalId,
    name,
    email,
    phone,
    source,
    channel,
    submittedAt,
    summary,
    raw: rawPayload
  }
}

export function fallbackExternalId(input: {
  clientSlug: string
  source: string
  name: string
  email: string | null
  phone: string | null
  submittedAt: string
}): string {
  const material = [
    input.clientSlug,
    input.source,
    input.name.toLowerCase(),
    (input.email || '').toLowerCase(),
    input.phone || '',
    input.submittedAt
  ].join('|')
  return `hash:${createHash('sha256').update(material).digest('hex').slice(0, 32)}`
}
