import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../../../', import.meta.url)

function migration(name) {
  return readFileSync(new URL(`supabase/migrations/${name}`, root), 'utf8')
}

test('tenancy migration derives membership from auth.uid and forces RLS', () => {
  const sql = migration('0019_portal_tenancy.sql')
  for (const table of ['tenants', 'tenant_memberships', 'tenant_invitations']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`, 'i'))
  }
  assert.match(sql, /auth\.uid\(\)/i)
  assert.match(sql, /tenant_kind\s*=\s*'internal'/i)
  assert.match(sql, /lower\s*\(/i)
  assert.match(sql, /expires_at/i)
  assert.match(sql, /consumed_at/i)
  assert.match(sql, /revoked_at/i)
  assert.match(sql, /set search_path\s*=\s*''/i)
  assert.match(sql, /pg_advisory_xact_lock/i)
  assert.match(
    sql,
    /grant execute on function public\.portal_magic_link_eligible\(text, uuid, text\) to service_role/i
  )
  assert.match(
    sql,
    /revoke all on function public\.portal_magic_link_eligible\(text, uuid, text\) from anon, authenticated/i
  )
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.portal_magic_link_eligible\([^)]*\) to [^;]*(?:anon|authenticated)/i
  )
})

test('delivery migration separates customer data from private task links', () => {
  const sql = migration('0020_portal_delivery_domain.sql')
  for (const table of [
    'delivery_projects',
    'delivery_items',
    'delivery_comments',
    'delivery_attachments',
    'delivery_decisions',
    'delivery_audit_events',
    'delivery_operator_task_links'
  ]) {
    assert.match(sql, new RegExp(`create table(?: if not exists)? public\\.${table}`, 'i'))
  }
  assert.match(sql, /alter table public\.delivery_operator_task_links force row level security/i)
  assert.ok(
    (sql.match(/dp\.customer_visible/gi) ?? []).length >= 4,
    'item and child-record policies must inherit project visibility'
  )
})

test('customer writes are constrained RPCs and storage is private', () => {
  const sql = migration('0021_portal_delivery_commands_storage.sql')
  for (const fn of [
    'portal_add_delivery_comment',
    'portal_complete_delivery_item',
    'portal_decide_delivery_item',
    'portal_register_delivery_attachment'
  ]) {
    assert.match(sql, new RegExp(`function public\\.${fn}`, 'i'))
  }
  assert.match(sql, /security definer/i)
  assert.match(sql, /set search_path\s*=\s*''/i)
  assert.match(sql, /portal-command:[^']*pg_advisory_xact_lock|pg_advisory_xact_lock[\s\S]*portal-command:/i)
  assert.match(sql, /storage\.buckets/i)
  assert.match(sql, /delivery-evidence/i)
  assert.doesNotMatch(sql, /public\s*:\s*true/i)
  assert.ok(
    (sql.match(/portal_has_tenant\(di\.tenant_id\)/gi) ?? []).length >= 4,
    'every item command must reject inactive or foreign tenant authority'
  )
  assert.match(sql, /di\.customer_visible\s+and\s+dp\.customer_visible/i)
})

test('operator-boundary migration removes all-authenticated private policies', () => {
  const sql = migration('0022_compass_web_operator_boundary.sql')
  assert.match(sql, /drop policy if exists "compass_tasks_all_authenticated"/i)
  assert.match(sql, /drop policy if exists "compass_invoices_all_authenticated"/i)
  assert.match(sql, /drop policy if exists "compass_messages_all_authenticated"/i)
  assert.match(sql, /portal_is_operator\s*\(\s*\)/i)
  assert.match(sql, /alter table public\.compass_tasks force row level security/i)
  assert.match(sql, /alter table public\.lead_contacts force row level security/i)
  assert.match(sql, /revoke insert, update, delete on table public\.compass_task_note_revisions/i)
})

test('inbound leads migration is tenant-scoped and select-only for members', () => {
  const sql = migration('0026_portal_inbound_leads.sql')
  assert.match(sql, /create table(?: if not exists)? public\.portal_inbound_leads/i)
  assert.match(sql, /alter table public\.portal_inbound_leads force row level security/i)
  assert.match(sql, /portal_inbound_leads_member_select/i)
  assert.match(sql, /portal_is_operator\(\)/i)
  assert.match(sql, /brisbane-city-home-loans/i)
  assert.match(sql, /else '\/leads'/i)
  assert.match(sql, /grant select on table public\.portal_inbound_leads to authenticated/i)
})

test('inbox triage migration adds lifecycle and cross-channel triage table', () => {
  const sql = migration('0033_inbox_triage.sql')
  assert.match(sql, /lifecycle_status/i)
  assert.match(sql, /create table(?: if not exists)? public\.portal_inbox_triage/i)
  assert.match(sql, /alter table public\.portal_inbox_triage force row level security/i)
  assert.match(sql, /portal_inbox_triage_operator_all/i)
  assert.match(sql, /portal_inbound_leads_operator_update/i)
  assert.match(sql, /grant update on table public\.portal_inbound_leads to authenticated/i)
})
