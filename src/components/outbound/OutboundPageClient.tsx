'use client'

import { useState } from 'react'
import Link from 'next/link'
import { OutboundHub } from '@/components/outbound/OutboundHub'
import { SequenceEditor } from '@/components/outbound/SequenceEditor'

export function OutboundPageClient() {
  const [editorOpen, setEditorOpen] = useState(false)

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/sales/outbound"
            className="text-[12px] font-medium text-[#c2410c] hover:underline"
          >
            ← Outbound
          </Link>
          <h1 className="compass-page-title mt-2 font-display text-2xl text-neutral-900">Craft</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Workshop, live Instantly, experiments, and the copy library. Planning lives on the
            calendar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-neutral-800 shadow-soft"
        >
          Editor
        </button>
      </div>
      <OutboundHub onOpenEditor={() => setEditorOpen(true)} />
      {editorOpen ? (
        <SequenceEditor unbound variant="overlay" onClose={() => setEditorOpen(false)} />
      ) : null}
    </>
  )
}
