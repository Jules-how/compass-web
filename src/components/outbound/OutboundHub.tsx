'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { OutboundExperimentCompare } from '@/components/outbound/OutboundExperimentCompare'
import { OutboundFactorSection } from '@/components/outbound/OutboundFactorSection'
import { OutboundHistorySection } from '@/components/outbound/OutboundHistorySection'
import { OutboundLibraryAccordion } from '@/components/outbound/OutboundLibraryAccordion'
import { OutboundLiveSection } from '@/components/outbound/OutboundLiveSection'

export function OutboundHub(_props: { onOpenEditor?: () => void } = {}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,28rem)]">
      <div className="min-w-0 space-y-6">
        <OutboundLiveSection />
        <OutboundExperimentCompare />
        <OutboundFactorSection />
        <OutboundHistorySection />
      </div>

      <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
        <OutboundLibraryAccordion />
      </aside>
    </div>
  )
}

export function LibraryPageShell({
  title,
  subtitle,
  actions,
  children
}: {
  title: string
  subtitle: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2">
            <Link href="/sales/outbound" className="text-[12px] font-medium text-[#c2410c] hover:underline">
              ← Outbound
            </Link>
          </div>
          <h1 className="compass-page-title font-display text-2xl text-neutral-900">{title}</h1>
          <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}
