'use client'

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <p className="text-sm text-neutral-500">{label}</p>
      <div className="h-10 animate-pulse rounded-lg bg-neutral-200/80" />
      <div className="h-10 animate-pulse rounded-lg bg-neutral-200/70" />
      <div className="h-10 animate-pulse rounded-lg bg-neutral-200/60" />
      <div className="h-10 animate-pulse rounded-lg bg-neutral-200/50" />
    </div>
  )
}
