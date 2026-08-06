import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

test('task mutation routes use portal operator RPCs and same-origin guard', () => {
  const createRoute = read('src/app/api/tasks/route.ts')
  const idRoute = read('src/app/api/tasks/[id]/route.ts')
  const notesRoute = read('src/app/api/tasks/[id]/notes/route.ts')

  assert.match(createRoute, /portal_operator_create_task_mutation/)
  assert.match(createRoute, /requireSameOrigin/)
  assert.match(idRoute, /portal_operator_apply_task_mutation/)
  assert.match(idRoute, /portal_operator_delete_task_mutation/)
  assert.match(idRoute, /requireSameOrigin/)
  assert.match(notesRoute, /compass_task_note/)
})

test('operator access remains session-backed with open-operator auto-login', () => {
  const access = read('src/lib/portal-access.ts')
  const serverClient = read('src/lib/supabase-server.ts')
  const middleware = read('src/middleware.ts')
  const openOperator = read('src/lib/open-operator.ts')

  assert.match(access, /getSupabaseServerClient/)
  assert.match(access, /supabase\.auth\.getUser\(\)/)
  assert.match(access, /options\.operator && !operator/)
  assert.doesNotMatch(access, /getPortalAdminClient/)
  assert.match(openOperator, /openOperatorCredentials/)
  assert.match(serverClient, /RLS is enforced as the logged-in user/)
  assert.match(middleware, /signInWithPassword/)
  assert.match(middleware, /openOperatorCredentials/)
})

test('operator pages still gate access and login supports open-operator fallback', () => {
  assert.match(read('src/app/(console)/layout.tsx'), /requireOperatorPageAccess/)
  for (const page of [
    'src/app/(console)/home/page.tsx',
    'src/app/(console)/tasks/page.tsx',
    'src/app/(console)/projects/page.tsx',
    'src/app/(console)/projects/[id]/page.tsx',
    'src/app/(console)/functions/page.tsx',
    'src/app/(console)/inbox/page.tsx',
    'src/app/leads/page.tsx'
  ]) {
    // Console pages inherit the shared layout gate; leads stays page-gated.
    if (page.includes('(console)') && !page.includes('leads')) {
      assert.match(
        read(page),
        /OperatorShell|TasksPanel|ProjectsPanel|FunctionsPanel|InboxPanel|ProjectDetailPanel|HomeDashboard/
      )
    } else {
      assert.match(read(page), /requireOperatorPageAccess/)
    }
  }
  const login = read('src/app/login/page.tsx')
  assert.match(login, /PasswordLoginForm/)
  assert.match(login, /isOpenOperatorEnabled/)
})

test('project and function routes are operator-gated with same-origin writes', () => {
  const projects = read('src/app/api/projects/route.ts')
  const projectId = read('src/app/api/projects/[id]/route.ts')
  const functions = read('src/app/api/functions/route.ts')
  const functionId = read('src/app/api/functions/[id]/route.ts')

  for (const source of [projects, projectId, functions, functionId]) {
    assert.match(source, /requirePortalAccess\(\{\s*operator:\s*true\s*\}\)/)
  }
  assert.match(projects, /requireSameOrigin/)
  assert.match(projectId, /requireSameOrigin/)
  assert.match(functions, /requireSameOrigin/)
  assert.match(functionId, /requireSameOrigin/)
  assert.match(projects, /compass_projects/)
  assert.match(functions, /compass_business_functions/)
})

test('client routes are operator-gated with same-origin writes', () => {
  const clients = read('src/app/api/clients/route.ts')
  const clientId = read('src/app/api/clients/[id]/route.ts')
  const issues = read('src/app/api/clients/[id]/issues/route.ts')
  const channel = read('src/app/api/clients/[id]/channel/route.ts')
  const page = read('src/app/(console)/clients/page.tsx')
  const detail = read('src/app/(console)/clients/[id]/page.tsx')

  for (const source of [clients, clientId, issues, channel]) {
    assert.match(source, /requirePortalAccess\(\{\s*operator:\s*true\s*\}\)/)
  }
  assert.match(clients, /requireSameOrigin/)
  assert.match(clientId, /requireSameOrigin/)
  assert.match(issues, /requireSameOrigin/)
  assert.match(channel, /requireSameOrigin/)
  assert.match(clients, /compass_clients/)
  assert.match(page, /ClientsPanel/)
  assert.match(detail, /ClientDetailPanel/)
})

test('operator nav covers the sectioned Compass surfaces', () => {
  const nav = read('src/components/NavLinks.tsx')
  for (const href of ['/home', '/inbox', '/tasks', '/projects', '/functions', '/clients', '/sales', '/sales/pipeline', '/operations/finances', '/settings']) {
    assert.match(nav, new RegExp(`href: '${href}'`))
  }
  assert.match(nav, /My Tasks/)
  assert.match(nav, /Pipeline/)
  assert.match(nav, /Finances/)
  assert.doesNotMatch(nav, /href: '\/delivery'/)
  assert.doesNotMatch(nav, /href: '\/leads\/upload'/)
})

test('operator console uses persistent layout with animated sidebar and sales overview', () => {
  const layout = read('src/app/(console)/layout.tsx')
  const shell = read('src/components/OperatorShell.tsx')
  const sidebar = read('src/components/ui/sidebar.tsx')
  const sales = read('src/app/(console)/sales/page.tsx')
  const overview = read('src/components/sales/SalesOverview.tsx')
  const chart = read('src/components/sales/EmailVolumeChart.tsx')
  const inbox = read('src/components/InboxPanel.tsx')
  const inboxApi = read('src/app/api/inbox/route.ts')

  assert.match(layout, /OperatorConsoleLayout/)
  assert.match(shell, /OperatorConsoleLayout/)
  assert.match(shell, /router\.prefetch/)
  assert.match(shell, /prefetchJson/)
  assert.match(shell, /md:h-\[100dvh\]/)
  assert.match(shell, /md:overflow-y-auto/)
  assert.match(sidebar, /framer-motion|motion\./)
  assert.match(sidebar, /sticky top-0/)
  assert.match(sales, /SalesOverview/)
  assert.match(overview, /EmailVolumeChart/)
  assert.match(overview, /Expected revenue|Deal flow|Campaign progress/)
  assert.match(chart, /Campaigns/)
  assert.match(chart, /Offers/)
  assert.match(chart, /Lists/)
  assert.match(inbox, /INBOX_TAB_LABELS/)
  assert.match(inbox, /INBOX_TABS/)
  assert.match(inboxApi, /badgeTotal/)
})
