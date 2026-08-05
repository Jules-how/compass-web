import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'

const required = [
  'PORTAL_TEST_URL',
  'PORTAL_TEST_ANON_KEY',
  'PORTAL_TEST_SERVICE_ROLE_KEY',
  'PORTAL_TEST_OPERATOR_USER',
  'PORTAL_TEST_TENANT_A_USER',
  'PORTAL_TEST_TENANT_A_ACCESS_TOKEN',
  'PORTAL_TEST_TENANT_B_USER',
  'PORTAL_TEST_TENANT_B_ACCESS_TOKEN'
]
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}; use a disposable Supabase branch only.`)
}

const url = process.env.PORTAL_TEST_URL
const anonKey = process.env.PORTAL_TEST_ANON_KEY
const serviceKey = process.env.PORTAL_TEST_SERVICE_ROLE_KEY
const operatorUser = process.env.PORTAL_TEST_OPERATOR_USER
const userA = process.env.PORTAL_TEST_TENANT_A_USER
const userB = process.env.PORTAL_TEST_TENANT_B_USER

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})
const customer = (token) =>
  createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  })
const clientA = customer(process.env.PORTAL_TEST_TENANT_A_ACCESS_TOKEN)
const clientB = customer(process.env.PORTAL_TEST_TENANT_B_ACCESS_TOKEN)

const tenantA = randomUUID()
const tenantB = randomUUID()
const membershipA = randomUUID()
const membershipB = randomUUID()
const projectA = randomUUID()
const projectB = randomUUID()
const hiddenProjectA = randomUUID()
const itemA = randomUUID()
const itemB = randomUUID()
const hiddenItemA = randomUUID()
const attachmentA = randomUUID()
const storagePathA = `${tenantA}/${projectA}/${itemA}/${attachmentA}/evidence`
const suffix = randomUUID().slice(0, 8)

async function expectSuccess(promise, label) {
  const result = await promise
  if (result.error) throw new Error(`${label} failed`)
  return result.data
}

async function cleanup() {
  await service.storage.from('delivery-evidence').remove([storagePathA])
  await service.from('delivery_audit_events').delete().in('tenant_id', [tenantA, tenantB])
  await service.from('delivery_operation_receipts').delete().in('tenant_id', [tenantA, tenantB])
  await service.from('portal_command_rate_events').delete().in('tenant_id', [tenantA, tenantB])
  await service.from('delivery_operator_task_links').delete().in('tenant_id', [tenantA, tenantB])
  await service.from('delivery_projects').delete().in('id', [projectA, projectB, hiddenProjectA])
  await service.from('tenant_memberships').delete().in('id', [membershipA, membershipB])
  await service.from('tenants').delete().in('id', [tenantA, tenantB])
}

try {
  await expectSuccess(
    service.from('tenants').insert([
      { id: tenantA, slug: `portal-live-a-${suffix}`, name: 'Portal live tenant A' },
      { id: tenantB, slug: `portal-live-b-${suffix}`, name: 'Portal live tenant B' }
    ]),
    'tenant fixture'
  )
  await expectSuccess(
    service.from('tenant_memberships').insert([
      {
        id: membershipA,
        tenant_id: tenantA,
        user_id: userA,
        normalized_email: `portal-a-${suffix}@test.invalid`,
        role: 'customer',
        status: 'active'
      },
      {
        id: membershipB,
        tenant_id: tenantB,
        user_id: userB,
        normalized_email: `portal-b-${suffix}@test.invalid`,
        role: 'operator',
        status: 'active'
      }
    ]),
    'membership fixture'
  )
  await expectSuccess(
    service.from('delivery_projects').insert([
      {
        id: projectA,
        tenant_id: tenantA,
        name: 'Tenant A project',
        customer_summary: 'A only',
        created_by: operatorUser
      },
      {
        id: projectB,
        tenant_id: tenantB,
        name: 'Tenant B project',
        customer_summary: 'B only',
        created_by: operatorUser
      },
      {
        id: hiddenProjectA,
        tenant_id: tenantA,
        name: 'Tenant A hidden project',
        customer_summary: 'Must remain hidden',
        customer_visible: false,
        created_by: operatorUser
      }
    ]),
    'project fixture'
  )
  await expectSuccess(
    service.from('delivery_items').insert([
      {
        id: itemA,
        tenant_id: tenantA,
        project_id: projectA,
        title: 'Tenant A request',
        customer_description: 'A only',
        action_owner: 'client',
        customer_state: 'awaiting_client',
        created_by: operatorUser
      },
      {
        id: itemB,
        tenant_id: tenantB,
        project_id: projectB,
        title: 'Tenant B request',
        customer_description: 'B only',
        action_owner: 'client',
        customer_state: 'awaiting_client',
        created_by: operatorUser
      },
      {
        id: hiddenItemA,
        tenant_id: tenantA,
        project_id: hiddenProjectA,
        title: 'Hidden tenant A request',
        customer_description: 'Must remain hidden',
        action_owner: 'client',
        customer_state: 'awaiting_client',
        customer_visible: true,
        created_by: operatorUser
      }
    ]),
    'item fixture'
  )
  await expectSuccess(
    service.from('delivery_operator_task_links').insert({
      delivery_item_id: itemA,
      tenant_id: tenantA,
      private_task_id: `private-${suffix}`,
      linked_by: operatorUser
    }),
    'private-link fixture'
  )

  const projectsSeenByA = await expectSuccess(
    clientA.from('delivery_projects').select('id').order('id'),
    'tenant A project list'
  )
  assert.deepEqual(projectsSeenByA.map((row) => row.id), [projectA])
  const projectsSeenByB = await expectSuccess(
    clientB.from('delivery_projects').select('id').order('id'),
    'tenant B project list'
  )
  assert.deepEqual(projectsSeenByB.map((row) => row.id), [projectB])

  const guessed = await expectSuccess(
    clientA.from('delivery_projects').select('id').eq('id', projectB),
    'cross-tenant guessed project'
  )
  assert.equal(guessed.length, 0)
  const hiddenItems = await expectSuccess(
    clientA.from('delivery_items').select('id').eq('id', hiddenItemA),
    'hidden-project item isolation'
  )
  assert.equal(hiddenItems.length, 0)

  const privateLinks = await expectSuccess(
    clientA.from('delivery_operator_task_links').select('delivery_item_id'),
    'private-link isolation'
  )
  assert.equal(privateLinks.length, 0)
  const privateTasks = await expectSuccess(
    clientA.from('compass_tasks').select('id').limit(1),
    'private task isolation'
  )
  assert.equal(privateTasks.length, 0)
  const customerTenantOperatorPrivateTasks = await expectSuccess(
    clientB.from('compass_tasks').select('id').limit(1),
    'customer-tenant operator isolation'
  )
  assert.equal(customerTenantOperatorPrivateTasks.length, 0)

  const crossComment = await expectSuccess(
    clientA.rpc('portal_add_delivery_comment', {
      p_item_id: itemB,
      p_operation_id: randomUUID(),
      p_body: 'cross-tenant attempt'
    }),
    'cross-tenant comment command'
  )
  assert.equal(crossComment.code, 'not_found')
  const hiddenComment = await expectSuccess(
    clientA.rpc('portal_add_delivery_comment', {
      p_item_id: hiddenItemA,
      p_operation_id: randomUUID(),
      p_body: 'hidden project attempt'
    }),
    'hidden-project comment command'
  )
  assert.equal(hiddenComment.code, 'not_found')
  const allowedComment = await expectSuccess(
    clientA.rpc('portal_add_delivery_comment', {
      p_item_id: itemA,
      p_operation_id: randomUUID(),
      p_body: 'tenant A evidence note'
    }),
    'same-tenant comment command'
  )
  assert.equal(allowedComment.ok, true)

  const forbiddenDirectMutation = await clientA
    .from('delivery_items')
    .update({ title: 'customer changed operator title' })
    .eq('id', itemA)
  assert.ok(forbiddenDirectMutation.error)

  const crossUpload = await clientB.storage
    .from('delivery-evidence')
    .upload(storagePathA, new Blob(['blocked'], { type: 'application/pdf' }), {
      contentType: 'application/pdf',
      upsert: false
    })
  assert.ok(crossUpload.error)

  await expectSuccess(
    clientA.storage
      .from('delivery-evidence')
      .upload(storagePathA, new Blob(['%PDF-portal-test'], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: false
      }),
    'same-tenant evidence upload'
  )
  const attachmentResult = await expectSuccess(
    clientA.rpc('portal_register_delivery_attachment', {
      p_item_id: itemA,
      p_operation_id: randomUUID(),
      p_attachment_id: attachmentA,
      p_storage_path: storagePathA,
      p_file_name: 'evidence.pdf',
      p_content_type: 'application/pdf',
      p_size_bytes: 16
    }),
    'same-tenant evidence registration'
  )
  assert.equal(attachmentResult.ok, true)

  const signedByA = await clientA.storage
    .from('delivery-evidence')
    .createSignedUrl(storagePathA, 60, { download: 'evidence.pdf' })
  assert.equal(signedByA.error, null)
  assert.ok(signedByA.data?.signedUrl)
  const signedByB = await clientB.storage
    .from('delivery-evidence')
    .createSignedUrl(storagePathA, 60, { download: 'evidence.pdf' })
  assert.ok(signedByB.error || !signedByB.data?.signedUrl)

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      checks: {
        tenantLists: true,
        guessedIds: true,
        hiddenProjectBoundary: true,
        privateTables: true,
        constrainedRpc: true,
        directMutationDenied: true,
        storageUploadIsolation: true,
        signedDownloadIsolation: true
      }
    })}\n`
  )
} finally {
  await cleanup()
}
