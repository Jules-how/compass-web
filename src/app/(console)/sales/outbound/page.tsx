import Link from 'next/link'
import { OperatorShell } from '@/components/OperatorShell'
import { OutboundHub } from '@/components/outbound/OutboundHub'

export default function OutboundPage() {
  return (
    <OperatorShell
      title="Outbound"
      subtitle="Libraries for offers, expressions, structures, CTAs, subjects, openers, and templates. Compose campaign sequences by copying library text into a forked draft."
      width="full"
      actions={
        <>
          <Link
            href="/sales/outbound/editor/new"
            className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-neutral-800 shadow-soft"
          >
            New unbound draft
          </Link>
          <Link
            href="/sales/pipeline"
            className="rounded-xl bg-[#e85d2a] px-3.5 py-2 text-[12px] font-semibold text-white shadow-soft"
          >
            Open planner
          </Link>
        </>
      }
    >
      <OutboundHub />
    </OperatorShell>
  )
}
