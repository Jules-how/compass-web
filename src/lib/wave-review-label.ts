import type { MorningWavePayload } from '@/lib/wave-morning'

export function waveReviewLabel(wave: MorningWavePayload | null | undefined): string {
  if (!wave || wave.reviewState === 'missing') return 'No current review is available.'
  if (wave.reviewState === 'stale') return `Previous brief · ${wave.briefDate ?? 'date unknown'}. Current decisions need a new review.`
  if (wave.reviewState !== 'current') return 'This brief has no verified review source. A new review is needed.'
  const time = wave.reviewedAt ? new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(wave.reviewedAt)) : 'time unavailable'
  return `Reviewed ${time} Sydney · Compass brief`
}
