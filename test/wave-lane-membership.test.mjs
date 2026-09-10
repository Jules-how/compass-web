import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTypescript } from './helpers/load-typescript.mjs'

const { groupCampaignsByWave, buildLiveDesk } = loadTypescript('src/lib/wave-desk.ts')

test('provider sending overrides a local preparation lane without duplicate membership', () => {
  for (const wave_lane of ['next', 'recommended']) {
    for (const status of ['live', 'launching']) {
      const campaign = { id: 'campaign-fixture', name: 'Fixture', status: 'draft', wave_lane, instantly_campaign_id: 'provider-fixture' }
      const provider = { id: 'provider-fixture', status, sendCount: 4, replyCount: 0, remaining: 36 }
      const instantlyById = new Map([[provider.id, provider]])
      const grouped = groupCampaignsByWave([campaign], instantlyById)
      const desk = buildLiveDesk({ liveCampaigns: grouped.live, allCampaigns: [campaign], instantlyById, instantlyRows: [provider] })
      assert.equal(grouped.next.length, 0)
      assert.equal(grouped.recommended.length, 0)
      assert.deepEqual(desk.sending.map(item => item.key), [campaign.id])
      assert.equal(desk.parked.length, 0)
      assert.equal(campaign.wave_lane, wave_lane)
    }
  }
})

test('missing provider evidence retains the local preparation lane', () => {
  const campaign = { id: 'campaign-fixture', name: 'Fixture', status: 'draft', wave_lane: 'next', instantly_campaign_id: 'provider-fixture' }
  const grouped = groupCampaignsByWave([campaign], new Map())
  assert.deepEqual(grouped.next.map(row => row.id), [campaign.id])
  assert.equal(grouped.live.length, 0)
})
