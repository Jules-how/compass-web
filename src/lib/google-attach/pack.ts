import 'server-only'

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { GooglePack } from '@/lib/google-attach/types'

const packCache = new Map<string, GooglePack>()

export const GOOGLE_PACK_IDS = [
  'plumbing_gas',
  'hvac_refrig',
  'electrical_av',
  'roofing'
] as const

function packDirectories(): string[] {
  const candidates = [
    process.env.GOOGLE_PACKS_DIR?.trim(),
    resolve(process.cwd(), 'funnels/google-packs'),
    resolve(process.cwd(), '../funnels/google-packs')
  ].filter((value): value is string => Boolean(value))
  return candidates.filter((dir) => existsSync(dir))
}

export function listGooglePackIds(): string[] {
  const dir = packDirectories()[0]
  if (!dir) return [...GOOGLE_PACK_IDS]
  const fromDisk = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''))
  return [...new Set([...GOOGLE_PACK_IDS, ...fromDisk])].sort()
}

export function loadGooglePack(packId: string): GooglePack {
  const cached = packCache.get(packId)
  if (cached) return cached

  for (const dir of packDirectories()) {
    const path = join(dir, `${packId}.json`)
    if (!existsSync(path)) continue
    const raw = JSON.parse(readFileSync(path, 'utf8')) as GooglePack
    if (raw.pack_id !== packId) {
      throw new Error(`pack_id mismatch: ${raw.pack_id} !== ${packId}`)
    }
    packCache.set(packId, raw)
    return raw
  }
  throw new Error(`google_pack_not_found:${packId}`)
}
