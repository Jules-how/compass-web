import { TEST_CELL_EMPTY, firstCampaignTag, testCellKey, type OfferSku } from '@/lib/offer-sku'

export const CITY_PLAN_TAGS = [
  'sydney',
  'melbourne',
  'brisbane',
  'perth',
  'adelaide',
  'gold-coast',
  'canberra'
] as const

export const MAX_CELLS_PER_REQUEST = 40

export function slugCampaignTag(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function prettyCampaignTag(value: string): string {
  if (!value || value === TEST_CELL_EMPTY) return ''
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function cellCampaignName(city: string, vertical: string): string {
  return `${prettyCampaignTag(city)} ${prettyCampaignTag(vertical)}`.trim()
}

export function parseSampleSizeTarget(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 20_000) return null
  return n
}

export function uniqueTags(values: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const tag = slugCampaignTag(raw)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
  }
  return out
}

export function verticalsForOffer(offer: Pick<OfferSku, 'lock' | 'vertical_tags'>): string[] {
  return uniqueTags([
    ...offer.lock.verticals.map((row) => row.key || row.name),
    ...offer.lock.verticalIn,
    ...offer.vertical_tags
  ])
}

export type PlanSlot = {
  key: string
  vertical: string
  city: string
}

export function planSlots(offerKey: string, verticals: string[], cities: string[]): PlanSlot[] {
  const offer = offerKey.trim()
  const verts = uniqueTags(verticals)
  const locs = uniqueTags(cities)
  const slots: PlanSlot[] = []
  for (const vertical of verts) {
    for (const city of locs) {
      slots.push({ key: testCellKey(offer, vertical, city), vertical, city })
    }
  }
  return slots
}

export function missingPlanSlots(
  offerKey: string,
  verticals: string[],
  cities: string[],
  existingKeys: Iterable<string>
): PlanSlot[] {
  const have = new Set(existingKeys)
  return planSlots(offerKey, verticals, cities).filter((slot) => !have.has(slot.key))
}

export function existingCellKey(campaign: {
  offer_key?: string | null
  vertical_tags?: string[] | null
  location_tags?: string[] | null
}): string {
  return testCellKey(
    (campaign.offer_key || '').trim(),
    firstCampaignTag(campaign.vertical_tags),
    firstCampaignTag(campaign.location_tags)
  )
}

export function isCityOrphan(
  campaign: {
    offer_key?: string | null
    vertical_tags?: string[] | null
    location_tags?: string[] | null
  },
  offerKey: string,
  vertical: string
): boolean {
  const offer = (campaign.offer_key || '').trim()
  if (offer !== offerKey) return false
  if (firstCampaignTag(campaign.vertical_tags) !== vertical) return false
  return firstCampaignTag(campaign.location_tags) === TEST_CELL_EMPTY
}
