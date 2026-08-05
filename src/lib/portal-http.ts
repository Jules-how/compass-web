import { NextResponse } from 'next/server'

import { parsePortalRpcResult } from './portal-contracts'
import { PortalAccessError } from './portal-access'

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8'
}

export function portalJson(body: unknown, init: ResponseInit = {}): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      ...JSON_HEADERS,
      ...(init.headers ?? {})
    }
  })
}

/** Short browser cache for list GETs — makes nav feel instant on revisit. */
export function portalJsonCached(
  body: unknown,
  init: ResponseInit = {},
  maxAgeSeconds = 20
): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: {
      'Cache-Control': `private, max-age=${maxAgeSeconds}, stale-while-revalidate=60`,
      ...JSON_HEADERS,
      ...(init.headers ?? {})
    }
  })
}

export function portalAccessResponse(error: unknown): NextResponse | null {
  if (!(error instanceof PortalAccessError)) return null
  return error.kind === 'unauthorized'
    ? portalJson({ error: 'unauthorized' }, { status: 401 })
    : portalJson({ error: 'not_found' }, { status: 404 })
}

export function requireSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  if (!origin || fetchSite === 'cross-site') {
    return portalJson({ error: 'forbidden' }, { status: 403 })
  }

  try {
    const requestUrl = new URL(request.url)
    return new URL(origin).origin === requestUrl.origin
      ? null
      : portalJson({ error: 'forbidden' }, { status: 403 })
  } catch {
    return portalJson({ error: 'forbidden' }, { status: 403 })
  }
}

export async function readBoundedJson(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error('request body is too large')
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error('request body is too large')
  }
  return JSON.parse(text)
}

export function portalCommandResponse(data: unknown, databaseError: unknown): NextResponse {
  if (databaseError) return portalJson({ error: 'operation_failed' }, { status: 500 })
  const result = parsePortalRpcResult(data)
  if (result.ok) return portalJson({ data: result })

  const status =
    result.code === 'not_found'
      ? 404
      : result.code === 'version_conflict' || result.code === 'operation_conflict'
        ? 409
        : result.code === 'rate_limited'
          ? 429
          : result.code === 'not_allowed'
            ? 403
            : result.code === 'unauthorized'
              ? 401
              : 400
  return portalJson({ error: result.code ?? 'operation_failed' }, { status })
}
