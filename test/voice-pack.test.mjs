import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packsDir = resolve(root, '../voice-agents/packs')

function readPack(id) {
  return JSON.parse(readFileSync(join(packsDir, `${id}.json`), 'utf8'))
}

test('all trade packs exist and share required keys', () => {
  const ids = ['plumbing_gas', 'hvac_refrig', 'electrical_av', 'roofing']
  for (const id of ids) {
    const pack = readPack(id)
    assert.equal(pack.pack_id, id)
    assert.equal(pack.locale, 'en-AU')
    assert.match(pack.recording_disclosure, /recorded/)
    assert.deepEqual(pack.urgency_values, ['today', 'this_week', 'flexible'])
    assert.ok(pack.job_types.length >= 5)
    assert.ok(pack.escalation.emergency.safety_line.length > 20)
    for (const key of ['recovery', 'confirm', 'inbound_opener', 'stop_ack']) {
      assert.ok(pack.sms[key].length > 10, `${id} sms.${key}`)
      if (key === 'recovery' || key === 'inbound_opener') {
        assert.match(pack.sms[key], /STOP/, `${id} sms.${key}`)
      }
    }
    assert.equal(pack.transfer.allowed, true)
    assert.equal(pack.transfer.default_enabled, true)
  }
})

test('pack recording disclosure matches compliance wording', () => {
  const expected =
    'This call is recorded so we can book the job accurately. If you do not want that, say so and I will take a message instead.'
  for (const file of readdirSync(packsDir).filter((f) => f.endsWith('.json') && f !== 'schema.json')) {
    const pack = readPack(file.replace('.json', ''))
    assert.equal(pack.recording_disclosure, expected, file)
  }
})

test('electrical and roofing emergency rules match trade protocol', () => {
  const electrical = readPack('electrical_av')
  const roofing = readPack('roofing')
  const eTriggers = electrical.escalation.emergency.triggers.join(' ').toLowerCase()
  const rTriggers = roofing.escalation.emergency.triggers.join(' ').toLowerCase()
  assert.match(eTriggers, /sparking/)
  assert.match(eTriggers, /burning smell/)
  assert.match(rTriggers, /active leak/)
  assert.match(rTriggers, /rain/)
  const eExtra = (electrical.qualify_extra || []).join(' ')
  const rExtra = (roofing.qualify_extra || []).join(' ')
  assert.match(eExtra, /Never give a price or quote/)
  assert.match(eExtra, /technical/)
  assert.match(rExtra, /Never give a price or quote/)
  assert.match(rExtra, /technical/)
})

test('emergency job types are not bookable', () => {
  const emergencyIds = {
    plumbing_gas: 'gas_leak',
    hvac_refrig: 'refrigerant_leak',
    electrical_av: 'electrical_hazard',
    roofing: 'major_leak'
  }
  for (const [packId, jobId] of Object.entries(emergencyIds)) {
    const pack = readPack(packId)
    const job = pack.job_types.find((j) => j.id === jobId)
    assert.ok(job, `${packId} missing ${jobId}`)
    assert.equal(job.bookable, false)
  }
})
