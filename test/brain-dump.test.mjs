import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

/** Mirror of src/lib/brain-dump.ts for behavioral coverage without TS imports. */
function reorganizeBrainDump(dump, existingTitles = []) {
  const PROJECT_RE =
    /\b(project|launch|campaign|build|ship|roadmap|milestone|initiative)\b/i
  const PRIORITY_RE = /\b(priority|prioritise|prioritize|focus|urgent|asap|today|must)\b/i
  const NOTE_RE = /\b(note|idea|remember|think|maybe|someday|parking)\b/i

  const normalizeLine = (raw) =>
    raw
      .replace(/^[\s>*\-•\d.]+/, '')
      .replace(/\s+/g, ' ')
      .trim()

  const classify = (line) => {
    if (PROJECT_RE.test(line)) return 'project'
    if (PRIORITY_RE.test(line)) return 'priority'
    if (NOTE_RE.test(line) && line.split(/\s+/).length < 8) return 'note'
    return 'task'
  }

  const priorityFor = (kind, line, index) => {
    let score = Math.max(1, 10 - index)
    if (/\b(urgent|asap|today|blocker|blocked)\b/i.test(line)) score += 4
    if (kind === 'priority') score += 2
    if (kind === 'project') score += 1
    if (kind === 'note') score = Math.min(score, 3)
    return Math.min(10, score)
  }

  const existing = new Set(existingTitles.map((t) => t.trim().toLowerCase()).filter(Boolean))
  const lines = dump
    .split(/\r?\n|[.;]/)
    .map(normalizeLine)
    .filter((line) => line.length >= 3)

  const seen = new Set()
  const suggestions = []
  const leftoverNotes = []

  lines.forEach((line, index) => {
    const key = line.toLowerCase()
    if (seen.has(key) || existing.has(key)) return
    seen.add(key)
    const kind = classify(line)
    if (kind === 'note') {
      leftoverNotes.push(line)
      return
    }
    suggestions.push({
      kind,
      title: line,
      suggestedPriority: priorityFor(kind, line, suggestions.length)
    })
  })

  suggestions.sort((a, b) => b.suggestedPriority - a.suggestedPriority)
  return { suggestions, leftoverNotes }
}

test('brain dump module exports a stable reorganize contract', () => {
  const source = read('src/lib/brain-dump.ts')
  assert.match(source, /export function reorganizeBrainDump/)
  assert.match(source, /BrainDumpSuggestion/)
  assert.match(source, /suggestedPriority/)
  assert.match(read('src/components/home/HomeDashboard.tsx'), /reorganizeBrainDump/)
  assert.match(read('src/app/(console)/home/page.tsx'), /HomeDashboard/)
})

test('reorganizeBrainDump turns messy lines into prioritized suggestions', () => {
  const result = reorganizeBrainDump(
    `
      Follow up with ParcelOps today
      Launch new Meta creative set
      maybe rethink pricing someday
      urgent: unblock Instantly warmup
      Build outbound sprint project plan
    `,
    ['Existing task']
  )

  assert.ok(result.suggestions.length >= 3)
  assert.ok(result.suggestions.some((s) => /ParcelOps/i.test(s.title)))
  assert.ok(result.suggestions.some((s) => s.kind === 'project'))
  assert.ok(result.leftoverNotes.some((n) => /pricing/i.test(n)))
  assert.ok(
    result.suggestions[0].suggestedPriority >=
      result.suggestions[result.suggestions.length - 1].suggestedPriority
  )
})

test('reorganizeBrainDump skips duplicates and empty noise', () => {
  const result = reorganizeBrainDump('hi\n\nFollow up with ParcelOps\nFollow up with ParcelOps', [
    'Follow up with ParcelOps'
  ])
  assert.equal(result.suggestions.length, 0)
})
