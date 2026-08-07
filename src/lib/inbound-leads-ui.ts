export const INBOUND_LEAD_SOURCES = [
  'website_ask',
  'fhb_guide',
  'meta_fhb',
  'meta_bridging',
  'bridging_guide',
  'meta_backfill'
] as const

export const INBOUND_LEAD_CHANNELS = ['website', 'meta', 'guide'] as const

export const LEAD_LIFECYCLE_STATUSES = ['new', 'contacted', 'qualified', 'discarded'] as const

export type InboundLeadSource = (typeof INBOUND_LEAD_SOURCES)[number]
export type InboundLeadChannel = (typeof INBOUND_LEAD_CHANNELS)[number]
export type LeadLifecycleStatus = (typeof LEAD_LIFECYCLE_STATUSES)[number]

export type PortalInboundLead = {
  id: string
  tenantId: string
  externalId: string | null
  source: InboundLeadSource
  channel: InboundLeadChannel
  name: string
  email: string | null
  phone: string | null
  submittedAt: string
  summary: string | null
  createdAt: string
  lifecycleStatus: LeadLifecycleStatus
  lifecycleUpdatedAt: string | null
}

export function projectInboundLead(row: Record<string, unknown>): PortalInboundLead {
  const lifecycle =
    typeof row.lifecycle_status === 'string' &&
    (LEAD_LIFECYCLE_STATUSES as readonly string[]).includes(row.lifecycle_status)
      ? (row.lifecycle_status as LeadLifecycleStatus)
      : 'new'
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    externalId: row.external_id == null ? null : String(row.external_id),
    source: row.source as InboundLeadSource,
    channel: row.channel as InboundLeadChannel,
    name: String(row.name),
    email: row.email == null ? null : String(row.email),
    phone: row.phone == null ? null : String(row.phone),
    submittedAt: String(row.submitted_at),
    summary: row.summary == null ? null : String(row.summary),
    createdAt: String(row.created_at),
    lifecycleStatus: lifecycle,
    lifecycleUpdatedAt:
      row.lifecycle_updated_at == null ? null : String(row.lifecycle_updated_at)
  }
}

export function inboundSourceLabel(source: InboundLeadSource): string {
  switch (source) {
    case 'website_ask':
      return 'Website'
    case 'fhb_guide':
      return 'FHB guide'
    case 'meta_fhb':
      return 'Meta FHB'
    case 'meta_bridging':
      return 'Meta bridging'
    case 'bridging_guide':
      return 'Bridging guide'
    case 'meta_backfill':
      return 'Meta (backfill)'
    default:
      return source
  }
}
