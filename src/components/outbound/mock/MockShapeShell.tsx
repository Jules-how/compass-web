'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { OperatorShell } from '@/components/OperatorShell'
import { CadenceControl, useCadencePrefs } from '@/components/outbound/CadenceControl'
import type { CadencePrefs } from '@/lib/outbound-cadence'

export function MockShapeShell({
  title,
  slots,
  actions,
  embedded = false,
  prefs: prefsProp,
  onPrefs,
  children
}: {
  title: string
  slots: number
  actions?: ReactNode
  embedded?: boolean
  prefs?: CadencePrefs
  onPrefs?: (next: CadencePrefs) => void
  children: (ctx: { prefs: CadencePrefs; setPrefs: (next: CadencePrefs) => void }) => ReactNode
}) {
  const [localPrefs, setLocalPrefs] = useCadencePrefs()
  const prefs = prefsProp ?? localPrefs
  const setPrefs = onPrefs ?? setLocalPrefs
  const body = children({ prefs, setPrefs })

  if (embedded) {
    return (
      <div>
        {actions ? <div className="mb-4 flex flex-wrap items-center gap-3">{actions}</div> : null}
        {body}
      </div>
    )
  }

  return (
    <OperatorShell
      title={title}
      subtitle="Preview. Live Outbound is unchanged."
      width="full"
      actions={
        <div className="flex flex-wrap items-end gap-4">
          {actions}
          <CadenceControl slots={slots} prefs={prefs} onChange={setPrefs} />
        </div>
      }
    >
      <p className="mb-4 text-sm text-neutral-500">
        <Link href="/sales/outbound/mock" className="font-medium text-[#c2410c] hover:underline">
          ← All shapes
        </Link>
      </p>
      {body}
    </OperatorShell>
  )
}
