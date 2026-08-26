'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { CsBoard, CsCard } from '@/lib/cs-dept/types'

export function CsClientHealth({ clientId }: { clientId: string }) {
  const [card, setCard] = useState<CsCard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/cs?client=${encodeURIComponent(clientId)}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as CsBoard & { error?: string }
        if (!res.ok) throw new Error(body.error || 'load_failed')
        if (!cancelled) setCard(body.cards[0] ?? null)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [clientId])

  if (error) {
    return <p className="text-xs text-neutral-400">Health unavailable</p>
  }
  if (!card) {
    return <p className="text-xs text-neutral-400">Scoring…</p>
  }

  return (
    <div className="space-y-2 border-t border-stone-100 pt-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Retention</div>
        <Link href="/operations/cs" className="text-[11px] font-medium text-[#c2410c] hover:underline">
          Monday queue
        </Link>
      </div>
      <p className="font-display text-2xl font-semibold tabular-nums text-neutral-900">{card.snapshot.score}</p>
      <p className="text-xs text-neutral-500">
        {card.snapshot.band.replace('_', ' ')}
        {card.snapshot.at_risk ? ' · save play drafted' : ''}
      </p>
      <p className="text-xs text-neutral-500">
        {card.artifacts.filter((row) => row.status === 'draft').length} draft
        {card.artifacts.filter((row) => row.status === 'draft').length === 1 ? '' : 's'} this week
      </p>
    </div>
  )
}
