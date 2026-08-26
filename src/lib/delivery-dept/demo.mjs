import { readFileSync } from 'node:fs'
import { applyNumberStrategy, completeStep, createInstall, hydrateFromVoice, setBlocked, syncCheckpointSla } from './orchestrator.mjs'
import { DEMO_PATH } from './paths.mjs'

export function loadDemoSeed() {
  return JSON.parse(readFileSync(DEMO_PATH, 'utf8'))
}

function playToStage(install, row) {
  const created = row.createdAt
  completeStep(install, 'intake_form', created)
  const order = ['number_strategy', 'retell_agent', 'calendar_grant', 'test_call', 'go_live', 'checkpoint']
  for (const id of order) {
    if (id === row.stage) break
    if (id === 'number_strategy') {
      applyNumberStrategy(install, row, created)
      continue
    }
    if (id === 'go_live') {
      completeStep(install, id, row.liveAt || created, { liveAt: row.liveAt })
      continue
    }
    completeStep(install, id, created)
  }
  if (row.voice) hydrateFromVoice(install, row.voice, created)
  if (row.liveAt) install.liveAt = row.liveAt
  if (row.checkpoints) {
    install.checkpoints = { ...install.checkpoints, ...row.checkpoints }
  }
  if (row.stage === 'checkpoint') {
    syncCheckpointSla(install, created)
  }
  if (row.blockedOn) setBlocked(install, row.stage, row.blockedOn)
  if (row.notes) install.notes = row.notes
  return install
}

export function buildDemoInstalls(seed = loadDemoSeed()) {
  return seed.installs.map((row) => {
    const install = createInstall(row, row.createdAt)
    return playToStage(install, row)
  })
}

export function demoNow(seed = loadDemoSeed()) {
  return seed.now
}
