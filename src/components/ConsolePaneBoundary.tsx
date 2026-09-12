'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

/** A failed retained desk must not unmount navigation or the other desks. */
export class ConsolePaneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Compass workspace failed', error, info.componentStack)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return <section role="alert" className="m-6 rounded-lg border border-neutral-200 bg-white p-6">
      <h2 className="text-lg font-semibold">This workspace couldn’t open</h2>
      <p className="my-3 text-sm text-neutral-600">You can still use the sidebar. Try again, or reload Compass to get the latest version.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="compass-btn-primary" onClick={() => this.setState({ failed: false })}>Try again</button>
        <button type="button" className="compass-btn-secondary" onClick={() => window.location.reload()}>Reload Compass</button>
      </div>
    </section>
  }
}
