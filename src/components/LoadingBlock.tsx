'use client'

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <p className="text-sm text-neutral-500">{label}</p>
      <div className="space-y-2.5">
        <div className="h-11 animate-pulse rounded-xl bg-gradient-to-r from-stone-200/80 via-stone-100 to-stone-200/80" />
        <div className="h-11 animate-pulse rounded-xl bg-gradient-to-r from-stone-200/70 via-stone-100 to-stone-200/70 [animation-delay:75ms]" />
        <div className="h-11 w-[88%] animate-pulse rounded-xl bg-gradient-to-r from-stone-200/60 via-stone-100 to-stone-200/60 [animation-delay:150ms]" />
        <div className="h-11 w-[72%] animate-pulse rounded-xl bg-gradient-to-r from-stone-200/50 via-stone-100 to-stone-200/50 [animation-delay:225ms]" />
      </div>
    </div>
  )
}
