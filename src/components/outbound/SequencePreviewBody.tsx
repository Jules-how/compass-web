'use client'

import type { LeadContact } from '@/lib/types'
import {
  isOpenerPreviewKey,
  leadFactsForPreview,
  leadPreviewValues,
  tokenizePreview
} from '@/lib/sequence-preview'
import { cn } from '@/lib/utils'

export function SequencePreviewText({
  text,
  lead,
  className
}: {
  text: string
  lead: LeadContact | null
  className?: string
}) {
  const values = leadPreviewValues(lead)
  const segments = tokenizePreview(text, values)
  const facts = leadFactsForPreview(lead)

  if (!lead) {
    return (
      <p className={cn('text-[14px] leading-relaxed text-neutral-400', className)}>
        Select a lead below to preview delivered variables.
      </p>
    )
  }

  return (
    <p className={cn('whitespace-pre-wrap text-[14px] leading-relaxed text-neutral-800', className)}>
      {segments.map((segment, index) => {
        if (segment.kind === 'text') {
          return <span key={index}>{segment.text}</span>
        }
        if (segment.kind === 'missing') {
          return (
            <span
              key={index}
              className="rounded bg-stone-100 px-1 text-[12px] text-neutral-400"
              title={`No value for {{${segment.key}}}`}
            >
              {`{{${segment.key}}}`}
            </span>
          )
        }
        if (isOpenerPreviewKey(segment.key)) {
          return (
            <span key={index} className="group relative inline">
              <span className="rounded bg-orange-50 px-0.5 decoration-dotted underline underline-offset-2">
                {segment.text}
              </span>
              <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-72 rounded-xl border border-stone-200 bg-white p-3 text-left text-[12px] font-normal text-neutral-700 shadow-soft group-hover:block">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  Opener · {lead.company || lead.name || 'Lead'}
                </span>
                {facts.length === 0 ? (
                  <span className="mt-1 block text-neutral-400">No research facts.</span>
                ) : (
                  facts.map((fact) => (
                    <span key={`${fact.kind}-${fact.claim}`} className="mt-1.5 block">
                      <span className="font-semibold text-neutral-500">{fact.kind}</span>
                      {': '}
                      {fact.claim}
                      {fact.url ? (
                        <span className="mt-0.5 block truncate text-[11px] text-neutral-400">
                          {fact.url}
                        </span>
                      ) : null}
                    </span>
                  ))
                )}
              </span>
            </span>
          )
        }
        return (
          <span key={index} className="rounded bg-stone-50 px-0.5">
            {segment.text}
          </span>
        )
      })}
    </p>
  )
}
