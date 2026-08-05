import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MagicLinkRequestSchema,
  parseAttachmentMetadata,
  parseCommentCommand,
  parseDecisionCommand,
  parseDeliveryListQuery,
  parseMagicLinkRequest,
  parsePasswordLoginRequest,
  projectCustomerItem,
  projectCustomerProject
} from '../../../packages/compass-core/src/portal-contracts.ts'

test('portal contracts are exported as shared Zod schemas', () => {
  assert.equal(typeof MagicLinkRequestSchema.safeParse, 'function')
  assert.equal(MagicLinkRequestSchema.safeParse({ email: 'client@example.com' }).success, true)
})

test('magic-link requests normalize invited email addresses', () => {
  assert.deepEqual(parseMagicLinkRequest({ email: '  Client@Example.COM ' }), {
    email: 'client@example.com'
  })
  assert.throws(() => parseMagicLinkRequest({ email: 'not-an-email' }), /email/i)
})

test('password login requests require email + password', () => {
  assert.deepEqual(
    parsePasswordLoginRequest({ email: '  Client@Example.COM ', password: 'password1' }),
    { email: 'client@example.com', password: 'password1' }
  )
  assert.throws(() => parsePasswordLoginRequest({ email: 'client@example.com', password: 'short' }), /password|String|8/i)
})

test('collection queries enforce bounded cursor pagination', () => {
  assert.deepEqual(parseDeliveryListQuery(new URLSearchParams('limit=999')), {
    cursor: null,
    limit: 50
  })
  assert.deepEqual(parseDeliveryListQuery(new URLSearchParams('limit=0')), {
    cursor: null,
    limit: 1
  })
  assert.throws(
    () => parseDeliveryListQuery(new URLSearchParams('cursor=not-a-cursor')),
    /cursor/i
  )
})

test('comment and decision commands reject unbounded or ambiguous writes', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  const operationId = '00000000-0000-4000-8000-000000000002'

  assert.equal(
    parseCommentCommand({ itemId: id, operationId, body: '  Evidence attached.  ' }).body,
    'Evidence attached.'
  )
  assert.throws(
    () => parseCommentCommand({ itemId: id, operationId, body: 'x'.repeat(4001) }),
    /4000/
  )
  assert.throws(
    () =>
      parseDecisionCommand({
        itemId: id,
        operationId,
        baseVersion: 1,
        decision: 'request_changes',
        comment: '   '
      }),
    /comment/i
  )
})

test('attachment policy blocks active content and bounds metadata', () => {
  assert.deepEqual(
    parseAttachmentMetadata({
      fileName: '../../proof of work.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024
    }),
    {
      fileName: 'proof of work.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024
    }
  )
  assert.throws(
    () =>
      parseAttachmentMetadata({
        fileName: 'payload.html',
        contentType: 'text/html',
        sizeBytes: 200
      }),
    /content type/i
  )
  assert.throws(
    () =>
      parseAttachmentMetadata({
        fileName: 'huge.pdf',
        contentType: 'application/pdf',
        sizeBytes: 10 * 1024 * 1024 + 1
      }),
    /size/i
  )
})

test('customer projections omit tenant and private operator fields', () => {
  const project = projectCustomerProject({
    id: 'project-a',
    tenant_id: 'tenant-a',
    name: 'Launch',
    customer_summary: 'Review the launch plan.',
    status: 'active',
    version: 2,
    updated_at: '2026-07-17T00:00:00.000Z',
    internal_status: 'margin-risk',
    billing_cents: 250000,
    operator_task_id: 'task-secret'
  })
  const item = projectCustomerItem({
    id: 'item-a',
    project_id: 'project-a',
    tenant_id: 'tenant-a',
    title: 'Approve copy',
    customer_description: 'Please review.',
    evidence_request: null,
    action_owner: 'client',
    customer_state: 'awaiting_client',
    due_at: null,
    reviewable: true,
    version: 3,
    updated_at: '2026-07-17T00:00:00.000Z',
    internal_notes: 'Never expose this',
    operator_task_id: 'task-secret'
  })

  assert.deepEqual(Object.keys(project).sort(), [
    'customerSummary',
    'id',
    'name',
    'status',
    'updatedAt',
    'version'
  ])
  assert.deepEqual(Object.keys(item).sort(), [
    'actionOwner',
    'customerDescription',
    'customerState',
    'dueAt',
    'evidenceRequest',
    'id',
    'projectId',
    'reviewable',
    'title',
    'updatedAt',
    'version'
  ])
  assert.doesNotMatch(JSON.stringify({ project, item }), /tenant-a|task-secret|margin-risk|billing/i)
})
