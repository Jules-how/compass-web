import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function mapWebhookEventToOutboundStatus(eventType) {
  switch ((eventType || '').trim().toLowerCase()) {
    case 'reply_received':
    case 'auto_reply_received':
    case 'lead_neutral':
      return 'replied'
    case 'lead_interested':
    case 'custom_label_any_positive':
      return 'interested'
    case 'lead_not_interested':
    case 'custom_label_any_negative':
      return 'not_interested'
    case 'lead_meeting_booked':
    case 'lead_meeting_completed':
      return 'meeting_booked'
    case 'lead_closed':
      return 'converted'
    case 'lead_out_of_office':
      return 'out_of_office'
    case 'lead_wrong_person':
      return 'wrong_person'
    case 'lead_unsubscribed':
    case 'email_bounced':
      return 'suppressed'
    case 'email_sent':
      return 'in_instantly'
    default:
      return null
  }
}

test('Instantly webhook events map into Compass outbound lanes', () => {
  assert.equal(mapWebhookEventToOutboundStatus('reply_received'), 'replied')
  assert.equal(mapWebhookEventToOutboundStatus('lead_interested'), 'interested')
  assert.equal(mapWebhookEventToOutboundStatus('lead_meeting_booked'), 'meeting_booked')
  assert.equal(mapWebhookEventToOutboundStatus('lead_closed'), 'converted')
  assert.equal(mapWebhookEventToOutboundStatus('email_bounced'), 'suppressed')
  assert.equal(mapWebhookEventToOutboundStatus('email_sent'), 'in_instantly')
})

test('Instantly webhook route is authenticated and documented', () => {
  const route = read('src/app/api/webhooks/instantly/route.ts')
  const lib = read('src/lib/instantly-webhook.ts')
  const docs = read('docs/AGENT_BRIDGE.md')
  assert.match(route, /applyInstantlyWebhookEvent/)
  assert.match(route, /INSTANTLY_WEBHOOK_SECRET/)
  assert.match(lib, /lead_status_source: 'instantly_webhook'/)
  assert.match(docs, /\/api\/webhooks\/instantly/)
})
