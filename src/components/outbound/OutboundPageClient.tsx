'use client'

import { useState } from 'react'
import Link from 'next/link'
import { OperatorShell } from '@/components/OperatorShell'
import { OutboundHub } from '@/components/outbound/OutboundHub'
import { SequenceEditor } from '@/components/outbound/SequenceEditor'

export function OutboundPageClient() {
  const [editorOpen, setEditorOpen] = useState(false)

  return (
    <>
      <OperatorShell
        title="Outbound"
        subtitle="Live campaign performance and history. Compose sequences in the Instantly-style editor — library components stay in the accordion on the right."
        width="full"
        actions={
          <>
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-neutral-800 shadow-soft"
            >
              Editor
            </button>
            <Link
              href="/sales/pipeline"
              className="rounded-xl bg-[#e85d2a] px-3.5 py-2 text-[12px] font-semibold text-white shadow-soft"
            >
              Open planner
            </Link>
          </>
        }
      >
        <OutboundHub onOpenEditor={() => setEditorOpen(true)} />
      </OperatorShell>

      {editorOpen ? (
        <SequenceEditor unbound variant="overlay" onClose={() => setEditorOpen(false)} />
      ) : null}
    </>
  )
}
