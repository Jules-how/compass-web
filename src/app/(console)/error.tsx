'use client'

import { useEffect } from 'react'

export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Compass page failed', error) }, [error])
  return <main className="m-6 rounded-lg border border-neutral-200 bg-white p-6" role="alert">
    <h1 className="text-xl font-semibold">Compass couldn’t open this page</h1>
    <p className="my-4 text-sm">Try again or reload the latest version of Compass.</p>
    <div className="flex flex-wrap gap-3">
      <button className="compass-btn-primary" onClick={reset}>Try again</button>
      <button className="compass-btn-secondary" onClick={() => window.location.reload()}>Reload Compass</button>
      <a className="compass-btn-secondary" href="/home">Go to Home</a>
    </div>
  </main>
}
