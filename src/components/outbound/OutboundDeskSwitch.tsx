'use client'

import { cn } from '@/lib/utils'
import type { OutboundDeskId } from '@/lib/outbound-desk'

const DESKS: Array<{ id: OutboundDeskId; label: string }> = [
  { id: 'waves', label: 'Waves' },
  { id: 'cassette', label: 'Cassette' },
  { id: 'runway', label: 'Runway' },
  { id: 'factory', label: 'Factory' },
  { id: 'calendar', label: 'Calendar' }
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
      className="flex flex-wrap rounded-xl border border-stone-200/80 bg-stone-50/80 p-0.5 shadow-soft"
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
            className={cn(
              'rounded-lg px-2.5 py-1 text-[12px] font-medium',
              active
                ? 'bg-white text-[#c2410c] shadow-soft'
                : 'text-neutral-500 hover:text-neutral-800'
            )}
          >
            {desk.label}
          </button>
        )
      })}
    </div>
  )
}
