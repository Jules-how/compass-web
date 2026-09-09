'use client'

import { cn } from '@/lib/utils'
import type { OutboundDeskId } from '@/lib/outbound-desk'

const DESKS: Array<{ id: OutboundDeskId; label: string }> = [
  { id: 'notebook', label: 'Notebook' },
  { id: 'waves', label: 'Waves' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'timeline', label: 'Timeline' }
]

export function OutboundDeskSwitch({
  value,
  onChange
}: {
  value: OutboundDeskId
  onChange: (next: OutboundDeskId) => void
}) {
  return (
    <div
      className="compass-seg"
      role="tablist"
      aria-label="Outbound desk"
    >
      {DESKS.map((desk) => {
        const active = value === desk.id
        return (
          <button
            key={desk.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(desk.id)}
            className={cn('compass-seg-btn', active && 'compass-seg-btn-active')}
          >
            {desk.label}
          </button>
        )
      })}
    </div>
  )
}
