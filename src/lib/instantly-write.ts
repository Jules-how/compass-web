import { instantlyFetch, InstantlyApiError } from '@/lib/instantly'

export type InstantlyLeadPayload = {
  email: string
  first_name?: string
  last_name?: string
  company_name?: string
  website?: string
  phone?: string
  personalization?: string
  custom_variables?: Record<string, string | number | boolean | null>
}

export type InstantlyBulkAddResult = {
  status?: string
  total_sent?: number
  leads_uploaded?: number
  skipped_count?: number
  invalid_email_count?: number
  duplicated_leads?: number
  in_blocklist?: number
  created_leads?: Array<{
    id: string
    index: number
    email?: string | null
    first_name?: string | null
    last_name?: string | null
  }>
}

export type InstantlyCampaignRecord = {
  id: string
  name?: string
  status?: number
  sequences?: unknown
}

export type InstantlySequenceStep = {
  type: string
  delay: number
  variants: Array<{ subject: string; body: string }>
}

export type InstantlySequencePayload = { steps: InstantlySequenceStep[] }

export async function instantlyAddLeadsBulk(
  apiKey: string,
  input: {
    campaignId: string
    leads: InstantlyLeadPayload[]
    skipIfInWorkspace?: boolean
    skipIfInCampaign?: boolean
    verifyOnImport?: boolean
  }
): Promise<InstantlyBulkAddResult> {
  if (input.leads.length === 0) {
    return { leads_uploaded: 0, created_leads: [], skipped_count: 0 }
  }
  return instantlyFetch<InstantlyBulkAddResult>('/leads/add', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      campaign_id: input.campaignId,
      leads: input.leads,
      skip_if_in_workspace: input.skipIfInWorkspace === true,
      skip_if_in_campaign: input.skipIfInCampaign !== false,
      verify_leads_on_import: input.verifyOnImport === true
    })
  })
}

export async function instantlyGetCampaign(
  apiKey: string,
  campaignId: string
): Promise<InstantlyCampaignRecord> {
  const id = campaignId.trim()
  if (!id) throw new InstantlyApiError('campaign id is required', 400)
  return instantlyFetch<InstantlyCampaignRecord>(`/campaigns/${encodeURIComponent(id)}`, apiKey)
}

export async function instantlyCreateCampaign(
  apiKey: string,
  input: {
    name: string
    sequences?: InstantlySequencePayload[]
    emailList?: string[]
    timezone?: string
  }
): Promise<InstantlyCampaignRecord> {
  const name = input.name.trim()
  if (!name) throw new InstantlyApiError('campaign name is required', 400)
  const timezone = input.timezone?.trim() || 'Australia/Melbourne'
  const body: Record<string, unknown> = {
    name,
    stop_on_reply: true,
    stop_on_auto_reply: true,
    campaign_schedule: {
      schedules: [
        {
          name: 'Weekdays',
          timing: { from: '09:00', to: '17:00' },
          days: {
            monday: true,
            tuesday: true,
            wednesday: true,
            thursday: true,
            friday: true,
            saturday: false,
            sunday: false
          },
          timezone
        }
      ]
    }
  }
  if (input.sequences?.length) body.sequences = input.sequences
  if (input.emailList?.length) body.email_list = input.emailList
  return instantlyFetch<InstantlyCampaignRecord>('/campaigns', apiKey, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export async function instantlyUpdateCampaign(
  apiKey: string,
  campaignId: string,
  patch: {
    name?: string
    sequences?: InstantlySequencePayload[]
    emailList?: string[]
  }
): Promise<InstantlyCampaignRecord> {
  const id = campaignId.trim()
  if (!id) throw new InstantlyApiError('campaign id is required', 400)
  const body: Record<string, unknown> = {}
  if (patch.name !== undefined) body.name = patch.name
  if (patch.sequences !== undefined) body.sequences = patch.sequences
  if (patch.emailList !== undefined) body.email_list = patch.emailList
  return instantlyFetch<InstantlyCampaignRecord>(`/campaigns/${encodeURIComponent(id)}`, apiKey, {
    method: 'PATCH',
    body: JSON.stringify(body)
  })
}

export async function instantlyListSendingEmails(apiKey: string): Promise<string[]> {
  const body = await instantlyFetch<{
    items?: Array<{ email?: string; status?: number }>
  } | Array<{ email?: string; status?: number }>>('/accounts?limit=100', apiKey)
  const items = Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : []
  return items
    .filter((row) => row.status == null || row.status === 1)
    .map((row) => (row.email || '').trim())
    .filter(Boolean)
}

export async function instantlyListCampaigns(
  apiKey: string,
  input?: { search?: string; limit?: number }
): Promise<InstantlyCampaignRecord[]> {
  const qs = new URLSearchParams()
  qs.set('limit', String(Math.min(100, Math.max(1, input?.limit ?? 20))))
  if (input?.search?.trim()) qs.set('search', input.search.trim())
  const body = await instantlyFetch<{ items?: InstantlyCampaignRecord[] } | InstantlyCampaignRecord[]>(
    `/campaigns?${qs}`,
    apiKey
  )
  return Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : []
}

export async function instantlyDuplicateCampaign(
  apiKey: string,
  campaignId: string,
  name?: string
): Promise<InstantlyCampaignRecord> {
  const id = campaignId.trim()
  if (!id) throw new InstantlyApiError('campaign id is required', 400)
  const body: Record<string, unknown> = {}
  if (name?.trim()) body.name = name.trim()
  return instantlyFetch<InstantlyCampaignRecord>(
    `/campaigns/${encodeURIComponent(id)}/duplicate`,
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify(body)
    }
  )
}

export async function instantlyPauseCampaign(
  apiKey: string,
  campaignId: string
): Promise<InstantlyCampaignRecord> {
  const id = campaignId.trim()
  if (!id) throw new InstantlyApiError('campaign id is required', 400)
  return instantlyFetch<InstantlyCampaignRecord>(
    `/campaigns/${encodeURIComponent(id)}/pause`,
    apiKey,
    { method: 'POST' }
  )
}
