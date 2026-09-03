'use client'

import { AlertTriangle, Check, X } from 'lucide-react'
import { evaluatePillarsQa, type PillarCheck, type PillarStatus, type OutboundSequence } from '@/lib/outbound-copy'
import { cn } from '@/lib/utils'

function StatusIcon({ status }: { status: PillarStatus }) {
  if (status === 'pass') {
    return <Check className="size-3.5 text-emerald-600" aria-hidden />
  }
  if (status === 'fail') {
    return <X className="size-3.5 text-red-600" aria-hidden />
  }
  return <AlertTriangle className="size-3.5 text-amber-600" aria-hidden />
}

function Row({ check }: { check: PillarCheck }) {
  return (
    <li className="flex gap-2 rounded-xl border border-stone-200/80 bg-white px-2.5 py-2">
      <span className="mt-0.5 shrink-0">
        <StatusIcon status={check.status} />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-neutral-800">{check.label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">{check.detail}</p>
      </div>
    </li>
  )
}

function badgeClass(status: PillarStatus): string {
  if (status === 'pass') return 'bg-emerald-50 text-emerald-800'
  if (status === 'fail') return 'bg-red-50 text-red-800'
  return 'bg-amber-50 text-amber-900'
}

export function PillarsQaInspector({
  sequence,
  className
}: {
  sequence: OutboundSequence | null
  className?: string
}) {
  const result = evaluatePillarsQa(sequence)

  return (
    <div className={cn('flex min-h-0 flex-col overflow-y-auto p-3', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-neutral-400">
            5-pillar QA
          </p>
          <p className="mt-0.5 text-[12px] text-pretty text-neutral-500">Email 1 and bump, live as you type.</p>
        </div>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
            badgeClass(result.mobileScan.status)
          )}
        >
          {result.email1Words}w
        </span>
      </div>
      <ul className="space-y-2">
        <Row check={result.mobileScan} />
        {result.pillars.map((check) => (
          <Row key={check.id} check={check} />
        ))}
        <Row check={result.threading} />
        <Row check={result.spintax} />
      </ul>
    </div>
  )
}
