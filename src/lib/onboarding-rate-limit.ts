import 'server-only'

import { randomBytes } from 'node:crypto'

const buckets = new Map<string, { count: number; resetAt: number }>()

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown'
}

export function checkOnboardingRateLimit(
  request: Request,
  token: string,
  action: 'read' | 'write'
): { ok: true } | { ok: false; retryAfterSec: number } {
  const ip = clientIp(request)
  const key = `${action}:${ip}:${token.slice(0, 12)}`
  const now = Date.now()
  const windowMs = 60_000
  const max = action === 'read' ? 60 : 30

  const current = buckets.get(key)
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }
  if (current.count >= max) {
    return { ok: false, retryAfterSec: Math.ceil((current.resetAt - now) / 1000) }
  }
  current.count += 1
  return { ok: true }
}

export function generateOnboardingToken(): string {
  return randomBytes(32).toString('base64url')
}

export function resolveAppOrigin(request?: Request): string {
  const fromEnv = process.env.APP_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_ORIGIN?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (request) return new URL(request.url).origin
  return 'http://localhost:3100'
}

export function onboardingFormUrl(token: string, request?: Request): string {
  return `${resolveAppOrigin(request)}/onboard/${token}`
}

export function bookingGrantEmail(): string {
  return process.env.BOOKING_GRANT_EMAIL?.trim() || 'booking@switchflow.agency'
}
