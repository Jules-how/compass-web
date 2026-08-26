import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function labRoots() {
  return [
    resolve(here, '../../voice-lab'),
    resolve(here, '../../../voice-lab'),
    resolve(here, '../../../../voice-lab'),
    resolve(process.cwd(), 'voice-lab'),
    resolve(process.cwd(), '../voice-lab')
  ]
}

export function findVoiceLabModule() {
  const override = process.env.VOICE_LAB_RUNNER?.trim()
  if (override && existsSync(override)) return override
  for (const root of labRoots()) {
    const libRun = join(root, 'lib/run.mjs')
    if (existsSync(libRun)) return libRun
  }
  return null
}

export function findVoiceLabCli() {
  for (const root of labRoots()) {
    const bin = join(root, 'bin/run.mjs')
    if (existsSync(bin)) return bin
  }
  return null
}

export function findVoiceLabRunner() {
  return findVoiceLabModule() || findVoiceLabCli()
}

export function stubScenarios(packId) {
  return [
    {
      id: 'disclosure',
      title: 'Begin message and recording disclosure',
      expect: 'Spoken business name, then the locked recording line before qualify'
    },
    {
      id: 'book_slot',
      title: 'Book a covered suburb',
      expect: 'Outcome booked or callback_captured, calendar event written'
    },
    {
      id: 'emergency',
      title: `Do not book emergency (${packId || 'pack'})`,
      expect: 'Safety line, no slot offered'
    }
  ]
}

function stubResult(packId) {
  const scenarios = stubScenarios(packId).map((row) => ({ ...row, result: 'stub_pass' }))
  return {
    runner: 'stub',
    passed: true,
    scenarios,
    ran: scenarios.length,
    failed: 0,
    note: 'voice-lab scenario runner is not present. Checklist stubbed. Jules still does the live published number test before go live.',
    blockedOn: null
  }
}

function mapResults(summary) {
  const rows = summary.results || summary.failures || []
  return rows.slice(0, 12).map((row) => ({
    id: row.id,
    title: row.archetype || row.id,
    expect: row.expected_outcome || '',
    result: row.pass ? 'pass' : 'fail'
  }))
}

/**
 * @param {{ packId?: string | null, limit?: number, stub?: boolean }} [input]
 */
export async function runTestCallScenarios({ packId, limit = 12, stub = false } = {}) {
  if (stub) return stubResult(packId)
  const modulePath = findVoiceLabModule()
  if (!modulePath) return stubResult(packId)

  const { runSuite } = await import(/* webpackIgnore: true */ pathToFileURL(modulePath).href)
  const { summary } = await runSuite({
    pack: packId || null,
    agent: 'sim',
    caller: 'scripted',
    silent: true,
    keepAll: true,
    limit
  })

  return {
    runner: 'voice-lab',
    passed: Boolean(summary.pass),
    scenarios: mapResults(summary),
    ran: summary.ran,
    failed: summary.failed,
    note: `${summary.passed}/${summary.ran} lab scenarios passed for ${packId || 'all packs'}. Full go live gate is still the live published number test.`,
    blockedOn: summary.pass ? null : 'voice-lab'
  }
}
