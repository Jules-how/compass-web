import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypescript } from './helpers/load-typescript.mjs'

function routeWithMissingSchema(missingTable) {
  const supabase = {
    from(table) {
      const result = table === missingTable
        ? { data: null, error: { message: table === 'portal_inbox_triage'
          ? 'relation public.portal_inbox_triage does not exist'
          : 'column portal_inbound_leads.lifecycle_status does not exist' } }
        : { data: table === 'compass_tasks' ? [{ id: 'fixture-task' }] : [], error: null }
      const query = new Proxy({}, {
        get(_target, property) {
          if (property === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject)
          return () => query
        }
      })
      return query
    }
  }
  return loadTypescript('src/app/api/inbox/route.ts', {
    '@/lib/portal-access': { requirePortalAccess: async () => ({ supabase }) },
    '@/lib/portal-http': {
      portalAccessResponse: () => null,
      portalJson: (body, options) => Response.json(body, options),
      portalJsonCached: body => Response.json(body)
    },
    '@/lib/instantly-leads-sync': { INSTANTLY_INBOX_OUTBOUND_STATUSES: ['replied'] }
  })
}

for (const missing of ['portal_inbox_triage', 'portal_inbound_leads']) {
  test(`Inbox fails closed when required ${missing} schema is unavailable`, async () => {
    const { GET } = routeWithMissingSchema(missing)
    const response = await GET(new Request('https://compass.example/api/inbox'))
    assert.equal(response.status, 500)
    const payload = await response.json()
    assert.equal(typeof payload.error, 'string')
    assert.equal(Object.hasOwn(payload, 'badgeTotal'), false)
    assert.equal(Object.hasOwn(payload, 'counts'), false)
    assert.equal(Object.hasOwn(payload, 'channels'), false)
  })
}
