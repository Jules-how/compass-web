/** Compass ledger outcomes + Instantly volume. Ignore opens. */

export type OutcomeVolume = {
  sent: number
  bounced: number
}

export type OutcomeCounts = {
  positive: number
  meetings: number
}

export type OutcomeMetrics = {
  delivered: number
  positive: number
  meetings: number
  positiveRate: number
  meetingsPer100: number
}

function ratePct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((1000 * part) / whole) / 10
}

export function computeOutcomeMetrics(
  volume: OutcomeVolume,
  counts: OutcomeCounts
): OutcomeMetrics {
  const sent = Math.max(0, volume.sent)
  const bounced = Math.max(0, volume.bounced)
  const delivered = Math.max(0, sent - bounced)
  const positive = Math.max(0, counts.positive)
  const meetings = Math.max(0, counts.meetings)
  return {
    delivered,
    positive,
    meetings,
    positiveRate: ratePct(positive, delivered),
    meetingsPer100: delivered > 0 ? Math.round((1000 * meetings) / delivered) / 10 : 0
  }
}
