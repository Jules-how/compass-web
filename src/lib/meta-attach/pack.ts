import 'server-only'

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { MetaPack } from '@/lib/meta-attach/types'

const TRADE_PACK_IDS = ['plumbing_gas', 'hvac_refrig', 'electrical_av', 'roofing'] as const

const packCache = new Map<string, MetaPack>()

function packDirectories(): string[] {
  const candidates = [
    process.env.META_PACKS_DIR?.trim(),
    resolve(process.cwd(), 'funnels/meta-packs'),
    resolve(process.cwd(), '../funnels/meta-packs')
  ].filter((value): value is string => Boolean(value))
  return candidates.filter((dir) => existsSync(dir))
}

export function listMetaPackIds(): string[] {
  const dir = packDirectories()[0]
  if (!dir) return [...TRADE_PACK_IDS]
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''))
    .sort()
}

export function loadMetaPack(packId: string): MetaPack {
  const cached = packCache.get(packId)
  if (cached) return cached

  for (const dir of packDirectories()) {
    const path = join(dir, `${packId}.json`)
    if (!existsSync(path)) continue
    const raw = JSON.parse(readFileSync(path, 'utf8')) as MetaPack
    if (raw.pack_id !== packId) {
      throw new Error(`meta_pack_id_mismatch:${packId}`)
    }
    packCache.set(packId, raw)
    return raw
  }

  throw new Error(`meta_pack_not_found:${packId}`)
}

export function resolveTradePackId(client: {
  industry?: string | null
  deal_terms?: { delivery?: Record<string, unknown> } | null
  voice?: Record<string, unknown> | null
}): string {
  const voicePack = String(client.voice?.trade_pack_id ?? '').trim()
  if (voicePack && listMetaPackIds().includes(voicePack)) return voicePack

  const trade = String(client.deal_terms?.delivery?.trade ?? client.industry ?? '').toLowerCase()
  if (trade.includes('plumb') || trade.includes('gas')) return 'plumbing_gas'
  if (
    trade.includes('hvac') ||
    trade.includes('refrig') ||
    trade.includes('air con') ||
    trade.includes('aircon')
  ) {
    return 'hvac_refrig'
  }
  if (trade.includes('electric') || trade.includes('av')) return 'electrical_av'
  if (trade.includes('roof')) return 'roofing'
  return 'plumbing_gas'
}

export { TRADE_PACK_IDS }
