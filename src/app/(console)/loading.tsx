export default function ConsoleLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8">
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <p className="sr-only">Loading…</p>
        <div className="mb-6 space-y-2">
          <div className="compass-skeleton h-3 w-28" />
          <div className="compass-skeleton h-8 w-48" />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="compass-panel space-y-3 p-5">
            <div className="compass-skeleton h-4 w-32" />
            <div className="compass-skeleton h-24 w-full" />
          </div>
          <div className="compass-panel space-y-3 p-5">
            <div className="compass-skeleton h-4 w-24" />
            <div className="compass-skeleton h-24 w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
