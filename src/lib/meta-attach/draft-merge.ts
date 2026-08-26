import type { ClientFactsForMetaAttach, MetaAttachCopy, MetaPack, MetaPackOfferCell } from '@/lib/meta-attach/types'

export type MergeFacts = {
  business_name: string
  city: string
  phone: string
  years?: number
}

export function slugifyClientName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function extractMergeFacts(client: ClientFactsForMetaAttach): MergeFacts {
  const delivery = client.deal_terms?.delivery ?? {}
  const voice = client.voice ?? {}
  const suburbs = String(delivery.service_suburbs ?? '').trim()
  const firstSuburb = suburbs.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)[0] ?? ''
  const city =
    firstSuburb ||
    String(delivery.trading_name ?? '')
      .trim()
      .split(' ')
      .slice(-1)[0] ||
    'your area'

  const phone = String(
    voice.published_number ?? voice.twilio_number ?? delivery.public_number ?? ''
  ).trim()

  return {
    business_name:
      String(delivery.spoken_business_name ?? delivery.trading_name ?? client.name).trim() ||
      client.name,
    city,
    phone,
    years: typeof delivery.years_in_business === 'number' ? delivery.years_in_business : undefined
  }
}

export function mergeCopyTemplate(text: string, facts: MergeFacts): string {
  let out = text
  out = out.replace(/\{\{business_name\}\}/g, facts.business_name)
  out = out.replace(/\{\{city\}\}/g, facts.city)
  out = out.replace(/\{\{phone\}\}/g, facts.phone)
  if (facts.years != null) {
    out = out.replace(/\{\{years\}\}/g, String(facts.years))
  }
  return out.trim()
}

export function mergeCopyBlock(
  lines: string[],
  facts: MergeFacts
): string[] {
  return lines.map((line) => mergeCopyTemplate(line, facts))
}

export function buildCopyFromCell(cell: MetaPackOfferCell, facts: MergeFacts): MetaAttachCopy {
  return {
    primary_texts: mergeCopyBlock(cell.primary_texts, facts),
    headlines: mergeCopyBlock(cell.headlines, facts),
    descriptions: mergeCopyBlock(cell.descriptions, facts)
  }
}

export function defaultDestinationUrl(client: ClientFactsForMetaAttach): string {
  const base = (process.env.SWITCHFLOW_SITES_BASE_URL ?? 'https://switchflow.agency').replace(
    /\/$/,
    ''
  )
  const slug = slugifyClientName(
    String(client.deal_terms?.delivery?.trading_name ?? client.name)
  )
  return `${base}/lp/${slug}`
}

export function buildDraftPayload(input: {
  client: ClientFactsForMetaAttach
  pack: MetaPack
  offerCell: string
  destinationUrl?: string
}): {
  offer_cell: string
  destination_url: string
  copy: MetaAttachCopy
  creative_brief: Record<string, unknown>
  review: Record<string, unknown>
} {
  const cell = input.pack.offer_cells[input.offerCell]
  if (!cell) {
    throw new Error(`meta_offer_cell_not_found:${input.offerCell}`)
  }
  const facts = extractMergeFacts(input.client)
  return {
    offer_cell: input.offerCell,
    destination_url: input.destinationUrl?.trim() || defaultDestinationUrl(input.client),
    copy: buildCopyFromCell(cell, facts),
    creative_brief: {
      ...cell.creative_brief,
      targeting_defaults: cell.targeting_defaults,
      budget_default_daily: cell.budget_default_daily,
      negative_notes: cell.negative_notes,
      messaging: cell.messaging,
      cta: cell.cta,
      destination_type: cell.destination_type
    },
    review: {
      years_in_business: facts.years ?? null
    }
  }
}
