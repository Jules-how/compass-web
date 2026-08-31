import type { InstallRecord } from './orchestrator.mjs'

export function buildDemoInstalls(): InstallRecord[]
export function demoNow(): string
export function loadDemoSeed(): { now: string; installs: Record<string, unknown>[] }
