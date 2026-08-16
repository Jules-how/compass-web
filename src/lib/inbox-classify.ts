export const INSTANTLY_CLASSIFY_ACTIONS = [
  { id: 'positive', label: 'Positive', outboundStatus: 'interested', tag: null },
  { id: 'not_now', label: 'Not now', outboundStatus: 'not_interested', tag: null },
  { id: 'wrong_person', label: 'Wrong person', outboundStatus: 'wrong_person', tag: null },
  { id: 'bad_offer', label: 'Bad offer', outboundStatus: 'not_interested', tag: 'bad_offer' },
  { id: 'ooo', label: 'OOO', outboundStatus: 'out_of_office', tag: null }
] as const

export type InstantlyClassifyId = (typeof INSTANTLY_CLASSIFY_ACTIONS)[number]['id']

export const CLASSIFY_OUTBOUND_STATUSES = [
  'interested',
  'not_interested',
  'wrong_person',
  'out_of_office',
  'meeting_booked',
  'replied',
  'suppressed',
  'uncontacted',
  'contacted',
  'booked',
  'converted'
] as const

export function classifyAction(id: string) {
  return INSTANTLY_CLASSIFY_ACTIONS.find((row) => row.id === id) ?? null
}

export function isClassifyOutboundStatus(value: string): boolean {
  return (CLASSIFY_OUTBOUND_STATUSES as readonly string[]).includes(value)
}
