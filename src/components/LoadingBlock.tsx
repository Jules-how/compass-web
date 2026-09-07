'use client'

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="w-full space-y-3" aria-busy="true" aria-live="polite">
      <p className="sr-only">{label}</p>
      <div className="compass-panel space-y-4 p-5">
        <div className="compass-skeleton h-3 w-24" />
        <div className="compass-skeleton h-8 w-56 max-w-full" />
        <div className="compass-skeleton h-28 w-full" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="compass-skeleton h-24" />
          <div className="compass-skeleton h-24" />
        </div>
      </div>
    </div>
  )
}
