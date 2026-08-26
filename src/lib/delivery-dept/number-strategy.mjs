/** Number plan for the Compass voice factory. v1 always buys a new Twilio AU mobile. */

export const TRADE_PACKS = {
  plumbing_gas: { label: 'plumbing / gas', aliases: ['plumbing', 'gas', 'plumber', 'plumbing_gas'] },
  hvac_refrig: { label: 'HVAC / refrigeration', aliases: ['hvac', 'air con', 'aircon', 'refrigeration', 'hvac_refrig'] },
  electrical_av: { label: 'electrical / AV', aliases: ['electrical', 'electrician', 'av', 'electrical_av'] },
  roofing: { label: 'roofing', aliases: ['roof', 'roofer', 'roofing'] }
}

const CARRIERS = new Set(['telstra', 'optus', 'vodafone', 'tpg', 'other'])
const LINE_TYPES = new Set(['mobile', 'landline'])

export function packFromTrade(trade) {
  const text = String(trade || '').toLowerCase()
  if (!text) return null
  for (const [packId, meta] of Object.entries(TRADE_PACKS)) {
    if (meta.aliases.some((alias) => text.includes(alias))) return packId
  }
  return null
}

export function packLabel(packId) {
  return TRADE_PACKS[packId]?.label || packId || 'trade'
}

export function chooseNumberStrategy(input = {}) {
  const packId = input.packId || packFromTrade(input.trade)
  if (!packId) {
    return { ok: false, error: 'trade_pack_unknown', strategy: null }
  }
  const carrier = CARRIERS.has(String(input.carrier || '').toLowerCase())
    ? String(input.carrier).toLowerCase()
    : 'other'
  const lineType = LINE_TYPES.has(String(input.lineType || '').toLowerCase())
    ? String(input.lineType).toLowerCase()
    : 'mobile'
  const afterHoursMode = input.afterHoursMode === 'unconditional' ? 'unconditional' : 'no_answer'

  return {
    ok: true,
    error: null,
    strategy: {
      mode: 'new_au_mobile',
      packId,
      packLabel: packLabel(packId),
      carrier,
      lineType,
      afterHoursMode,
      notes:
        'Buy a new Twilio AU mobile. Owner keeps the published number. Forward no answer and busy. Do not port. Do not use a branded sender.'
    }
  }
}
