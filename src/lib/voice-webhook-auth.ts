import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyRetellSignature(
  rawBody: string,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!secret?.trim() || !signature?.trim()) return false
  const expected = createHmac('sha256', secret.trim()).update(rawBody).digest('hex')
  const provided = signature.replace(/^v=/, '').trim()
  if (expected.length !== provided.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
  } catch {
    return false
  }
}

/** Twilio request validation — https://www.twilio.com/docs/usage/security#validating-requests */
export function verifyTwilioSignature(
  authToken: string | undefined,
  signature: string | null,
  url: string,
  params: Record<string, string>
): boolean {
  if (!authToken?.trim() || !signature?.trim()) return false
  const sorted = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url)
  const expected = createHmac('sha1', authToken.trim()).update(sorted).digest('base64')
  if (expected.length !== signature.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

export function formBodyToRecord(form: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  form.forEach((value, key) => {
    out[key] = String(value)
  })
  return out
}
