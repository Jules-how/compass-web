'use client'

import type { RecontactEligibility, RecontactLane } from '@/lib/recontact-eligibility'

const SIZE = 36
const STROKE = 3.5
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

function ringColors(lane: RecontactLane, percent: number | null): {
  track: string
  stroke: string
  text: string
} {
  if (lane === 'blocked') {
    return { track: '#e7e5e4', stroke: '#a8a29e', text: '#57534e' }
  }
  if (lane === 'ready' || (percent != null && percent >= 100 && lane !== 'hot')) {
    return { track: '#d1fae5', stroke: '#059669', text: '#047857' }
  }
  if (lane === 'hot') {
    return { track: '#ffedd5', stroke: '#ea580c', text: '#c2410c' }
  }
  if (lane === 'never_contacted') {
    return { track: '#e7e5e4', stroke: '#d6d3d1', text: '#a8a29e' }
  }
  // cooling — muted stone → green as it fills
  const warm = percent != null && percent >= 70
  return {
    track: '#e7e5e4',
    stroke: warm ? '#10b981' : '#78716c',
    text: warm ? '#047857' : '#57534e'
  }
}

export function RecontactProgressRing({
  eligibility,
  size = SIZE,
  className
}: {
  eligibility: RecontactEligibility
  size?: number
  className?: string
}) {
  const { lane, progressPercent, daysRemaining, label } = eligibility
  const colors = ringColors(lane, progressPercent)
  const pct = progressPercent == null ? 0 : Math.min(100, Math.max(0, progressPercent))
  const offset = C * (1 - pct / 100)
  const display =
    lane === 'blocked'
      ? '✕'
      : lane === 'never_contacted'
        ? '—'
        : `${pct}%`

  const title =
    lane === 'ready'
      ? label
      : lane === 'cooling' && daysRemaining != null
        ? `${label} · ${daysRemaining}d left`
        : label

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ''}`}
      style={{ width: size, height: size }}
      title={title}
      aria-label={title}
    >
      <svg width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={colors.track}
          strokeWidth={STROKE}
        />
        {lane !== 'never_contacted' && lane !== 'blocked' && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
          />
        )}
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold tabular-nums leading-none"
        style={{ color: colors.text }}
      >
        {display}
      </span>
    </div>
  )
}
