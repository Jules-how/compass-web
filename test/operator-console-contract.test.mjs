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
  for (const page of [
    'src/app/tasks/page.tsx',
    'src/app/projects/page.tsx',
    'src/app/projects/[id]/page.tsx',
    'src/app/functions/page.tsx',
    'src/app/inbox/page.tsx',
    'src/app/leads/page.tsx'
  ]) {
    assert.match(read(page), /requireOperatorPageAccess/)
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
