#!/usr/bin/env node
/**
 * Instantly history backfill → compass_evidence_events (via agent API).
 *
 * Usage (dev server must be running, or point at deployed Compass):
 *   COMPASS_AGENT_SECRET=… node scripts/backfill-instantly.mjs --dry-run
 *   node scripts/backfill-instantly.mjs --reset --dry-run
 *   COMPASS_BASE_URL=https://… node scripts/backfill-instantly.mjs --max-campaigns 2
 *
 * DO NOT run against production without review. Dry-run first.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvLocal() {
  const path = resolve(root, '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

function parseArgs(argv) {
  const out = { dryRun: false, reset: false }
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--reset') out.reset = true
    else if (arg === '--max-campaigns') out.maxCampaigns = Number(argv[++i])
  }
  return out
}

loadEnvLocal()
const args = parseArgs(process.argv)

const baseUrl = (process.env.COMPASS_BASE_URL || 'http://localhost:3100').replace(/\/$/, '')
const secret = process.env.COMPASS_AGENT_SECRET?.trim()

if (!secret) {
  console.error('Missing COMPASS_AGENT_SECRET')
  process.exit(1)
}

const body = {
  dryRun: args.dryRun,
  reset: args.reset,
  ...(typeof args.maxCampaigns === 'number' && !Number.isNaN(args.maxCampaigns)
    ? { maxCampaigns: args.maxCampaigns }
    : {})
}

console.log(
  JSON.stringify(
    {
      target: `${baseUrl}/api/agent/instantly/backfill`,
      mode: args.dryRun ? 'dry-run' : 'live',
      warning: args.dryRun
        ? 'Counts events only — no writes'
        : 'Writes compass_evidence_events. Confirm target is not production unless intended.'
    },
    null,
    2
  )
)

const res = await fetch(`${baseUrl}/api/agent/instantly/backfill`, {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(body)
})

const text = await res.text()
let json
try {
  json = JSON.parse(text)
} catch {
  console.error(text)
  process.exit(1)
}

console.log(JSON.stringify(json, null, 2))
if (!res.ok) process.exit(1)
