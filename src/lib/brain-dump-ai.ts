import { generateText, Output } from 'ai'
import { z } from 'zod'
import {
  reorganizeBrainDump,
  type BrainDumpKind,
  type BrainDumpReorganizeResult,
  type BrainDumpSuggestion
} from '@/lib/brain-dump'

export type BrainDumpSource = 'ai' | 'heuristic'

export type BrainDumpReorganizeResponse = BrainDumpReorganizeResult & {
  source: BrainDumpSource
}

const MAX_DUMP_CHARS = 4_000
const MAX_EXISTING = 40
const MAX_SUGGESTIONS = 12

const suggestionSchema = z.object({
  kind: z.enum(['task', 'project', 'priority', 'note']),
  title: z.string().min(1).max(160),
  rationale: z.string().min(1).max(220),
  suggestedPriority: z.number().int().min(1).max(4),
  sourceLine: z.string().min(1).max(240)
})

const planSchema = z.object({
  summary: z.string().min(1).max(280),
  suggestions: z.array(suggestionSchema).max(MAX_SUGGESTIONS),
  leftoverNotes: z.array(z.string().max(200)).max(12)
})

const SYSTEM = `You turn messy operator brain dumps into a tight priority plan for Switchflow Compass.
Rules:
- Prefer actionable tasks and today's priorities over vague notes.
- kind=project only for multi-step initiatives/outcomes.
- kind=note for parking-lot ideas (also put those in leftoverNotes).
- Skip duplicates of existingTitles (case-insensitive).
- Merge near-duplicates; rewrite titles to be short and clear.
- suggestedPriority uses Linear-style 1-4: 1=urgent, 2=high, 3=medium, 4=low. Urgency and leverage win.
- Keep rationale one short sentence.
- Return at most ${MAX_SUGGESTIONS} suggestions.
- Be decisive and lean — no fluff.`

function defaultModel(): string {
  return (process.env.COMPASS_AI_MODEL || 'openai/gpt-5.4-nano').trim()
}

/** True when Gateway auth is likely available (API key, OIDC pull, or Vercel runtime). */
export function isAiGatewayLikelyConfigured(): boolean {
  if (process.env.COMPASS_AI_ENABLED === '0' || process.env.COMPASS_AI_ENABLED === 'false') {
    return false
  }
  return Boolean(
    process.env.AI_GATEWAY_API_KEY ||
      process.env.VERCEL_OIDC_TOKEN ||
      process.env.VERCEL === '1'
  )
}

function clampDump(dump: string): string {
  const trimmed = dump.trim()
  if (trimmed.length <= MAX_DUMP_CHARS) return trimmed
  return trimmed.slice(0, MAX_DUMP_CHARS)
}

function normalizeAiPlan(
  plan: z.infer<typeof planSchema>,
  existingTitles: string[]
): BrainDumpReorganizeResult {
  const existing = new Set(existingTitles.map((t) => t.trim().toLowerCase()).filter(Boolean))
  const seen = new Set<string>()
  const suggestions: BrainDumpSuggestion[] = []
  const leftoverNotes: string[] = []

  for (const note of plan.leftoverNotes) {
    const cleaned = note.trim()
    if (cleaned) leftoverNotes.push(cleaned)
  }

  plan.suggestions.forEach((item, index) => {
    const title = item.title.trim()
    const key = title.toLowerCase()
    if (!title || seen.has(key) || existing.has(key)) return
    seen.add(key)

    const kind = item.kind as BrainDumpKind
    if (kind === 'note') {
      leftoverNotes.push(title)
      return
    }

    suggestions.push({
      id: `ai-${index}-${key.slice(0, 24)}`,
      kind,
      title: title.length > 120 ? `${title.slice(0, 117)}…` : title,
      rationale: item.rationale.trim() || 'Suggested from your brain dump.',
      suggestedPriority: Math.min(4, Math.max(1, Math.round(item.suggestedPriority))),
      sourceLine: item.sourceLine.trim() || title
    })
  })

  suggestions.sort((a, b) => a.suggestedPriority - b.suggestedPriority)

  return {
    summary: plan.summary.trim() || `Proposed ${suggestions.length} item(s).`,
    suggestions: suggestions.slice(0, MAX_SUGGESTIONS),
    leftoverNotes: leftoverNotes.slice(0, 12)
  }
}

async function reorganizeWithAi(
  dump: string,
  existingTitles: string[]
): Promise<BrainDumpReorganizeResult> {
  const { output } = await generateText({
    model: defaultModel(),
    system: SYSTEM,
    prompt: JSON.stringify({
      dump: clampDump(dump),
      existingTitles: existingTitles.slice(0, MAX_EXISTING)
    }),
    output: Output.object({ schema: planSchema }),
    temperature: 0.2,
    maxOutputTokens: 900
  })

  if (!output) {
    throw new Error('empty_ai_output')
  }

  return normalizeAiPlan(output, existingTitles)
}

/**
 * Prefer a real model via Vercel AI Gateway; fall back to local heuristics.
 * Keeps the Home brain-dump button useful with or without AI credentials.
 */
export async function reorganizeBrainDumpSmart(
  dump: string,
  existingTitles: string[] = []
): Promise<BrainDumpReorganizeResponse> {
  const safeDump = clampDump(dump)
  if (!safeDump) {
    return { ...reorganizeBrainDump('', existingTitles), source: 'heuristic' }
  }

  const aiEnabled = isAiGatewayLikelyConfigured()

  if (aiEnabled) {
    try {
      const plan = await reorganizeWithAi(safeDump, existingTitles)
      if (plan.suggestions.length > 0 || plan.leftoverNotes.length > 0) {
        return { ...plan, source: 'ai' }
      }
    } catch {
      /* fall through to heuristic */
    }
  }

  return { ...reorganizeBrainDump(safeDump, existingTitles), source: 'heuristic' }
}
