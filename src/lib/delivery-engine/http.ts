import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export class DeliveryHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export const secretHash = (value: string) => createHash('sha256').update(value).digest('hex')
export function validSecret(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected || expected.length < 24) return false
  const a = Buffer.from(provided); const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Bound actual bytes while streaming, including requests without Content-Length. */
export async function boundedText(request: Request, maximum = 32_768): Promise<string> {
  if (Number(request.headers.get('content-length')) > maximum) throw new DeliveryHttpError(413, 'Request is too large')
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []; let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maximum) { await reader.cancel(); throw new DeliveryHttpError(413, 'Request is too large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks).toString('utf8')
}

export async function boundedJson(request: Request): Promise<unknown> {
  try { return JSON.parse(await boundedText(request)) }
  catch (error) { if (error instanceof DeliveryHttpError) throw error; throw new DeliveryHttpError(400, 'Invalid JSON') }
}

/** Fixed configured public origin: never trust forwarded host headers for signatures. */
export async function verifiedTwilioForm(request: Request, env: NodeJS.ProcessEnv = process.env): Promise<URLSearchParams> {
  if (!env.TWILIO_AUTH_TOKEN || !env.TWILIO_ACCOUNT_SID || !env.COMPASS_DELIVERY_PUBLIC_ORIGIN) throw new DeliveryHttpError(503, 'Webhook is not configured')
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) throw new DeliveryHttpError(415, 'Expected form data')
  const origin = new URL(env.COMPASS_DELIVERY_PUBLIC_ORIGIN)
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username) throw new DeliveryHttpError(503, 'Invalid public origin')
  const actual = new URL(request.url)
  const signedUrl = `${origin.origin}${actual.pathname}${actual.search}`
  const form = new URLSearchParams(await boundedText(request))
  const keys = [...new Set(form.keys())].sort()
  let input = signedUrl
  for (const key of keys) {
    const values = form.getAll(key)
    if (values.length !== 1) throw new DeliveryHttpError(400, 'Duplicate form parameter')
    input += key + values[0]
  }
  const expected = createHmac('sha1', env.TWILIO_AUTH_TOKEN).update(input).digest('base64')
  if (!validSecret(request.headers.get('x-twilio-signature'), expected) || form.get('AccountSid') !== env.TWILIO_ACCOUNT_SID) throw new DeliveryHttpError(403, 'Invalid webhook signature')
  if (!/^SM[a-f0-9]{32}$/i.test(form.get('MessageSid') ?? '')) throw new DeliveryHttpError(400, 'Invalid message identifier')
  return form
}

const id = z.string().uuid()
const key = z.string().min(8).max(200)
export const operatorCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('demo.start'), key, scenario: z.enum(['conversation', 'qualified', 'outside_area', 'no_permission']).default('conversation') }).strict(),
  z.object({ type: z.literal('demo.reply'), accountId: id, enquiryId: id, key, body: z.string().trim().min(1).max(1600) }).strict(),
  z.object({ type: z.literal('demo.advance'), accountId: id, hours: z.number().int().min(1).max(168), key }).strict(),
  z.object({ type: z.literal('run'), accountId: id }).strict(),
  z.object({ type: z.literal('operator'), accountId: id, enquiryId: id, key,
    action: z.enum(['takeover', 'resolve', 'resume', 'send', 'crm_reconciled']), reason: z.string().max(500).optional(), body: z.string().trim().min(1).max(1000).optional(),
    evidence: z.string().trim().min(1).max(1000).optional(), recordId: z.string().trim().min(1).max(200).optional()
  }).strict().refine(d => d.action !== 'send' || !!d.body, 'A message is required')
    .refine(d => d.action !== 'crm_reconciled' || (!!d.evidence && !!d.recordId), 'CRM reference and evidence are required'),
  z.object({ type: z.literal('outcome'), accountId: id, enquiryId: id, key, stage: z.enum(['attended','quoted','won','lost']),
    evidence: z.string().trim().min(3).max(1000), occurredAt: z.iso.datetime({ offset: true }), value: z.number().min(0).max(100_000_000).optional()
  }).strict(),
  z.object({ type: z.literal('assign'), accountId: id, enquiryId: id, messageId: id }).strict()
])
