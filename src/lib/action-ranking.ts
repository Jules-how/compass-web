/** Ranked digest actions — score = cash_at_stake × urgency × confidence. */

export type RankedActionInput = {
  key: string
  title: string
  due: string | null
  reason: string
  href: string
  cashAtStake: number
  urgency: number
  eventCount: number
  proof?: Array<{ kind: string; min_count?: number; filter?: Record<string, unknown> }>
}

export type RankedAction = RankedActionInput & {
  score: number
  confidence: number
}

/** n ≥ 30 → 1.0; linear below. */
export function confidenceFromEventCount(n: number): number {
  const count = Math.max(0, Math.round(Number(n) || 0))
  if (count >= 30) return 1
  if (count <= 0) return 0.2
  return Math.round((count / 30) * 1000) / 1000
}

export function scoreRankedAction(input: RankedActionInput): RankedAction {
  const cash = Math.max(0, Number(input.cashAtStake) || 0)
  const urgency = Math.max(0, Math.min(1, Number(input.urgency) || 0))
  const confidence = confidenceFromEventCount(input.eventCount)
  const score = Math.round(cash * urgency * confidence)
  return { ...input, confidence, score }
}

export function rankActions(inputs: RankedActionInput[], limit = 5): RankedAction[] {
  return inputs
    .map(scoreRankedAction)
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.cashAtStake - a.cashAtStake)
    .slice(0, limit)
}

/** True when 14d positive rate is materially below the 90d baseline (min delivered). */
export function campaignUnderperforming(
  delivered14d: number,
  positiveRate14d: number,
  delivered90d: number,
  positiveRate90d: number,
  minDelivered = 200
): boolean {
  if (delivered14d < minDelivered || delivered90d < minDelivered) return false
  if (positiveRate90d <= 0) return false
  return positiveRate14d < positiveRate90d * 0.6
}

export function formatScoreReason(parts: {
  cash: number
  urgency: number
  confidence: number
  detail: string
}): string {
  const cash = Math.round(parts.cash).toLocaleString()
  const urgency = Math.round(parts.urgency * 100)
  const confidence = Math.round(parts.confidence * 100)
  return `${parts.detail} Score ${cash} × ${urgency}% urgency × ${confidence}% confidence.`
}
