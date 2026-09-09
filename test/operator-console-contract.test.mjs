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
    'src/app/(console)/functions/[id]/page.tsx',
    'src/app/(console)/inbox/page.tsx',
    'src/app/(console)/leads/page.tsx'
  ]) {
    // Home/Inbox/Sales/CRM/workspace list bodies live in ConsoleHomeInboxKeepAlive
    // for instant tab switches.
    if (
      page.includes('(console)/home') ||
      page.includes('(console)/inbox') ||
      page.includes('(console)/leads') ||
      page.includes('(console)/tasks') ||
      page.includes('(console)/projects/page') ||
      page.includes('(console)/functions/page')
    ) {
      assert.match(read(page), /OperatorShell/)
      const keepAlive = read('src/components/ConsoleHomeInboxKeepAlive.tsx')
      if (page.includes('/home')) assert.match(keepAlive, /HomeDashboard/)
      else if (page.includes('/inbox')) assert.match(keepAlive, /InboxPanel/)
      else if (page.includes('/leads')) assert.match(keepAlive, /LeadsPanel/)
      else if (page.includes('/tasks')) assert.match(keepAlive, /TasksPanel/)
      else if (page.includes('/projects')) assert.match(keepAlive, /ProjectsPanel/)
      else if (page.includes('/functions')) assert.match(keepAlive, /FunctionsPanel/)
    } else if (page.includes('(console)') && !page.includes('leads')) {
      assert.match(
        read(page),
        /OperatorShell|TasksPanel|ProjectsPanel|FunctionsPanel|FunctionDetailPanel|InboxPanel|ProjectDetailPanel|HomeDashboard/
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
  const metaAds = read('src/app/api/clients/[id]/meta-ads/route.ts')
  const comms = read('src/app/api/clients/[id]/comms/route.ts')
  const page = read('src/app/(console)/clients/page.tsx')
  const detail = read('src/app/(console)/clients/[id]/page.tsx')

  for (const source of [clients, clientId, issues, channel, metaAds, comms]) {
    assert.match(source, /requirePortalAccess\(\{\s*operator:\s*true\s*\}\)/)
  }
  assert.match(clients, /requireSameOrigin/)
  assert.match(clientId, /requireSameOrigin/)
  assert.match(issues, /requireSameOrigin/)
  assert.match(channel, /requireSameOrigin/)
  assert.match(metaAds, /requireSameOrigin/)
  assert.match(comms, /requireSameOrigin/)
  assert.match(clients, /compass_clients/)
  assert.match(comms, /compass_client_comm_threads/)
  assert.match(page, /OperatorShell/)
  assert.match(read('src/components/ConsoleHomeInboxKeepAlive.tsx'), /ClientsPanel/)
  assert.match(detail, /ClientsPanel/)
  assert.match(detail, /initialClientId/)
  assert.match(read('src/components/clients/ClientDirectory.tsx'), /ClientDetailModal/)
  assert.match(read('src/components/clients/ClientDetailModal.tsx'), /ClientDetailPanel/)
})

test('operator nav covers the sectioned Compass surfaces', () => {
  const nav = read('src/components/NavLinks.tsx')
  for (const href of ['/home', '/inbox', '/tasks', '/projects', '/functions', '/clients', '/sales', '/sales/outbound', '/leads', '/operations/finances', '/operations/installs', '/operations/cs', '/settings']) {
    assert.match(nav, new RegExp(`href: '${href}'`))
  }
  assert.match(nav, /My Tasks/)
  assert.match(nav, /Outbound/)
  assert.doesNotMatch(nav, /label: 'Pipeline'/)
  assert.match(nav, /label: 'CRM'/)
  assert.match(nav, /Finances/)
  assert.match(nav, /Retention/)
  assert.doesNotMatch(nav, /href: '\/delivery'/)
  assert.doesNotMatch(nav, /href: '\/leads\/upload'/)
})

test('operator console uses persistent Folio layout and sales overview', () => {
  const layout = read('src/app/(console)/layout.tsx')
  const shell = read('src/components/OperatorShell.tsx')
  const navLinks = read('src/components/NavLinks.tsx')
  const sidebar = read('src/components/ui/sidebar.tsx')
  const sales = read('src/app/(console)/sales/page.tsx')
  const overview = read('src/components/sales/SalesOverview.tsx')
  const chart = read('src/components/sales/EmailVolumeChart.tsx')
  const inbox = read('src/components/InboxPanel.tsx')
  const inboxApi = read('src/app/api/inbox/route.ts')

  assert.match(layout, /OperatorConsoleLayout/)
  assert.match(shell, /OperatorConsoleLayout/)
  assert.match(shell, /router\.prefetch/)
  // Home + Inbox RSC prefetch only. Instantly / clients / campaigns stay hover-only.
  assert.match(shell, /prefetchJson\('\/api\/tasks'/)
  assert.doesNotMatch(shell, /OPERATOR_PREFETCH/)
  assert.doesNotMatch(shell, /prefetchJson\('\/api\/instantly/)
  assert.doesNotMatch(shell, /prefetchJson\('\/api\/clients/)
  assert.match(navLinks, /prefetchJson/)
  assert.match(shell, /ConsoleHomeInboxKeepAlive/)
  assert.match(shell, /ConsoleNavProvider/)
  // The mobile header and main content now share one viewport-height shell.
  assert.match(shell, /compass-shell folio-shell/)
  assert.match(shell, /overflow-y-auto scrollbar-gutter-stable/)
  assert.match(shell, /scrollbar-gutter-stable/)
  assert.match(shell, /mx-auto w-full/)
  assert.match(read('src/components/TaskList.tsx'), /role="tablist"/)
  assert.match(read('src/components/TaskList.tsx'), /tabular-nums/)
  assert.match(read('src/components/TaskList.tsx'), /min-w-\[11\.5rem\]/)
  assert.match(read('src/components/ConsoleNav.tsx'), /isKeepAlivePath/)
  assert.match(read('src/components/ConsoleHomeInboxKeepAlive.tsx'), /seenHome|seenInbox|seenOverview|seenCrm|seenTasks/)
  assert.match(read('next.config.ts'), /staleTimes/)
  assert.match(read('next.config.ts'), /optimizePackageImports/)
  assert.match(read('vercel.json'), /icn1/)
  assert.match(read('src/lib/home-data.ts'), /instantlyBoard: false/)
  assert.doesNotMatch(read('src/lib/home-data.ts'), /refreshEvidenceIfStale/)
  assert.match(read('src/lib/pipeline-spine.ts'), /head: true/)
  assert.match(read('src/app/api/home/route.ts'), /after\(/)
  assert.match(read('src/app/(console)/loading.tsx'), /Loading/)
  assert.match(read('src/lib/portal-access.ts'), /MEMBERSHIP_CACHE_TTL_MS/)
  assert.match(shell, /Skip to main content/)
  assert.match(shell, /id="compass-main"/)
  assert.match(sidebar, /aria-current/)
  assert.match(sidebar, /framer-motion|motion\./)
  assert.match(sidebar, /sticky top-0/)
  assert.match(sales, /OperatorShell/)
  assert.match(read('src/components/ConsoleHomeInboxKeepAlive.tsx'), /SalesOverview/)
  assert.match(overview, /EmailVolumeChart/)
  assert.match(overview, /Expected revenue|Deal flow|Campaign progress/)
  assert.match(chart, /Campaigns/)
  assert.match(chart, /Offers/)
  assert.match(chart, /Lists/)
  assert.match(inbox, /INBOX_TAB_LABELS/)
  assert.match(inbox, /INBOX_TABS/)
  assert.match(inbox, /history\.replaceState/)
  assert.doesNotMatch(inbox, /router\.replace/)
  assert.match(inboxApi, /badgeTotal/)
})

test('console middleware skips API routes to avoid double Auth round-trips', () => {
  const middleware = read('src/middleware.ts')
  assert.match(middleware, /api\(\?:\/\|\$\)/)
  assert.match(middleware, /signInWithPassword/)
  // Prefer user from sign-in response — no second getUser() after auto-login.
  assert.match(middleware, /data\.user/)
})

test('Home does not hover-prefetch Instantly cold-email', () => {
  const nav = read('src/components/NavLinks.tsx')
  assert.match(nav, /href: '\/home'/)
  assert.doesNotMatch(nav, /api: '\/api\/instantly\/cold-email'/)
})

test('Instantly cold-email glance is process-cached', () => {
  const client = read('src/lib/instantly.ts')
  assert.match(client, /COLD_EMAIL_CACHE_TTL_MS/)
  assert.match(client, /coldEmailCache/)
})
