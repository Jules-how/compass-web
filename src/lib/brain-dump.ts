export type BrainDumpKind = 'task' | 'project' | 'priority' | 'note'

export type BrainDumpSuggestion = {
  id: string
  kind: BrainDumpKind
  title: string
  rationale: string
  suggestedPriority: number
  sourceLine: string
}

export type BrainDumpReorganizeResult = {
  summary: string
  suggestions: BrainDumpSuggestion[]
  leftoverNotes: string[]
}

const PROJECT_RE =
  /\b(project|launch|campaign|build|ship|roadmap|milestone|initiative)\b/i
const PRIORITY_RE = /\b(priority|prioritise|prioritize|focus|urgent|asap|today|must)\b/i
const NOTE_RE = /\b(note|idea|remember|think|maybe|someday|parking)\b/i

function normalizeLine(raw: string): string {
  return raw
    .replace(/^[\s>*\-•\d.]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function classify(line: string): BrainDumpKind {
  if (PROJECT_RE.test(line)) return 'project'
  if (PRIORITY_RE.test(line)) return 'priority'
  if (NOTE_RE.test(line) && line.split(/\s+/).length < 8) return 'note'
  return 'task'
}

function priorityFor(kind: BrainDumpKind, line: string, index: number): number {
  let score = Math.max(1, 10 - index)
  if (/\b(urgent|asap|today|blocker|blocked)\b/i.test(line)) score += 4
  if (kind === 'priority') score += 2
  if (kind === 'project') score += 1
  if (kind === 'note') score = Math.min(score, 3)
  return Math.min(10, score)
}

function rationaleFor(kind: BrainDumpKind, line: string): string {
  if (/\b(urgent|asap|today)\b/i.test(line)) {
    return 'Flagged as time-sensitive — surface near the top of Today’s Priorities.'
  }
  switch (kind) {
    case 'project':
      return 'Reads like a project/initiative — keep as a tracked outcome, not a one-off chore.'
    case 'priority':
      return 'Explicit focus language — promote into today’s priority stack.'
    case 'note':
      return 'Capture as a note until it becomes actionable.'
    default:
      return 'Actionable work item — propose as a task under today’s priorities.'
  }
}

/**
 * Lightweight “AI brain” pass: turn free-form dump lines into ordered suggestions.
 * Swap the body for an LLM later; keep this contract stable for the Home UI.
 */
export function reorganizeBrainDump(
  dump: string,
  existingTitles: string[] = []
): BrainDumpReorganizeResult {
  const existing = new Set(existingTitles.map((t) => t.trim().toLowerCase()).filter(Boolean))
  const lines = dump
    .split(/\r?\n|[.;]/)
    .map(normalizeLine)
    .filter((line) => line.length >= 3)

  const seen = new Set<string>()
  const suggestions: BrainDumpSuggestion[] = []
  const leftoverNotes: string[] = []

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
      id: `bd-${index}-${key.slice(0, 24)}`,
      kind,
      title: line.length > 120 ? `${line.slice(0, 117)}…` : line,
      rationale: rationaleFor(kind, line),
      suggestedPriority: priorityFor(kind, line, suggestions.length),
      sourceLine: line
    })
  })

  suggestions.sort((a, b) => b.suggestedPriority - a.suggestedPriority)

  const taskCount = suggestions.filter((s) => s.kind === 'task' || s.kind === 'priority').length
  const projectCount = suggestions.filter((s) => s.kind === 'project').length
  const summary =
    suggestions.length === 0
      ? 'Nothing actionable yet — add a few lines and run again.'
      : `Proposed ${taskCount} task${taskCount === 1 ? '' : 's'}` +
        (projectCount ? ` and ${projectCount} project cue${projectCount === 1 ? '' : 's'}` : '') +
        (leftoverNotes.length ? `; parked ${leftoverNotes.length} note${leftoverNotes.length === 1 ? '' : 's'}` : '') +
        '.'

  return { summary, suggestions, leftoverNotes }
}
