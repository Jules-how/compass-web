'use client'

import Link from 'next/link'
import { OperatorShell } from '@/components/OperatorShell'
import { OutboundFactorMockup } from '@/components/outbound/OutboundFactorMockup'

export default function OutboundFactorMockPage() {
  return (
    <OperatorShell
      title="Outbound · mockup"
      subtitle="Coded preview of Performance by factor — demo data, not production."
      width="full"
      actions={
        <Link
          href="/sales/outbound"
          className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-neutral-800 shadow-soft"
        >
          Real Outbound
        </Link>
      }
    >
      <OutboundFactorMockup />
    </OperatorShell>
  )
}
