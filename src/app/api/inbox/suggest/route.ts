import type { NextRequest } from 'next/server'
import { generateText } from 'ai'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { isAiGatewayLikelyConfigured } from '@/lib/brain-dump-ai'
import {
  parseInboxChannel,
  parseLeadLifecycle,
  suggestInboxNextStep,
  type InboxSuggestion
} from '@/lib/inbox-triage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type SuggestBody = {
  tab?: string
  title?: string
  preview?: string | null
  body?: string | null
  email?: string | null
  phone?: string | null
  agentStatus?: string | null
  instantlyStatus?: string | null
  lifecycle?: string | null
  sourceLabel?: string | null
}

function defaultModel(): string {
  return (process.env.COMPASS_AI_MODEL || 'openai/gpt-5.4-nano').trim()
}

async function maybeAiRefine(
  heuristic: InboxSuggestion,
  input: SuggestBody
): Promise<InboxSuggestion> {
  if (!isAiGatewayLikelyConfigured()) return heuristic
  if (process.env.COMPASS_INBOX_AI === '0' || process.env.COMPASS_INBOX_AI === 'false') {
    return heuristic
  }

  try {
    const { text } = await generateText({
      model: defaultModel(),
      system: `You suggest one concrete next operator action for a Switchflow Compass Inbox item.
Return exactly two lines:
NEXT: <imperative next step, max 140 chars>
WHY: <one short rationale, max 160 chars>
No markdown. Be decisive.`,
      prompt: [
        `Channel: ${input.tab}`,
        `Title: ${input.title}`,
        `Status: ${input.agentStatus || input.instantlyStatus || input.lifecycle || 'n/a'}`,
        `Source: ${input.sourceLabel || 'n/a'}`,
        `Preview: ${(input.preview || input.body || '').slice(0, 400)}`,
        `Heuristic next: ${heuristic.nextStep}`,
        `Heuristic why: ${heuristic.rationale}`
      ].join('\n')
    })

    const nextMatch = text.match(/NEXT:\s*(.+)/i)
    const whyMatch = text.match(/WHY:\s*(.+)/i)
    const nextStep = nextMatch?.[1]?.trim()
    const rationale = whyMatch?.[1]?.trim()
    if (!nextStep) return heuristic
    return {
      nextStep: nextStep.slice(0, 160),
      rationale: (rationale || heuristic.rationale).slice(0, 200),
      source: 'ai'
    }
  } catch {
    return heuristic
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: SuggestBody
  try {
    body = (await readBoundedJson(request, 16_000)) as SuggestBody
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const tab = parseInboxChannel(body.tab)
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!tab || !title) return portalJson({ error: 'invalid_item' }, { status: 400 })

  try {
    await requirePortalAccess({ operator: true })
    const heuristic = suggestInboxNextStep({
      tab,
      title,
      preview: body.preview,
      body: body.body,
      email: body.email,
      phone: body.phone,
      agentStatus: body.agentStatus,
      instantlyStatus: body.instantlyStatus,
      lifecycle: parseLeadLifecycle(body.lifecycle) ?? undefined,
      sourceLabel: body.sourceLabel
    })
    const suggestion = await maybeAiRefine(heuristic, body)
    return portalJson(suggestion)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'suggest_failed' }, { status: 500 })
  }
}
