import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { Script } from 'node:vm'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'

const root = resolve(import.meta.dirname, '../..')
const nativeRequire = createRequire(import.meta.url)
const cache = new Map()

/** Run the real TypeScript modules in Node, with only Next's server marker stubbed. */
export function source(path) {
  const filename = resolve(root, path)
  if (cache.has(filename)) return cache.get(filename).exports
  const module = { exports: {} }; cache.set(filename, module)
  const js = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  const require = spec => {
    if (spec === 'server-only') return {}
    if (spec.startsWith('.') || spec.startsWith('@/')) {
      const base = spec.startsWith('@/') ? resolve(root, 'src', spec.slice(2)) : resolve(dirname(filename), spec)
      const target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync)
      if (target) return source(target)
    }
    return nativeRequire(spec)
  }
  new Script(`(function(require,module,exports){${js}\n})`, { filename }).runInThisContext()(require, module, module.exports)
  return module.exports
}

export const { DeliveryStore } = source('src/lib/delivery-engine/store.ts')
export const { runDeliveryWorker, ProviderError } = source('src/lib/delivery-engine/worker.ts')
export const { demoConfig, initialState, isOptOut } = source('src/lib/delivery-engine/config.ts')
export const { createDeliveryProviders } = source('src/lib/delivery-engine/providers.ts')
export const DEMO = 'd0000000-0000-4000-8000-000000000001'
export const START = '2026-09-09T00:00:00.000Z'

export async function harness(options = {}) {
  const db = new PGlite(options.directory)
  await db.waitReady
  if (!options.existing) {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.compass_clients(id text primary key);
      create function public.portal_is_operator() returns boolean language sql stable as $$ select coalesce(current_setting('test.operator',true),'false')='true' $$;`)
    await db.exec(readFileSync(resolve(root, 'supabase/migrations/0080_compass_delivery_engine.sql'), 'utf8'))
  }
  const rpc = async (name, args) => {
    if (!/^delivery_[a-z_]+$/.test(name) || Object.keys(args).some(k => !/^p_[a-z_]+$/.test(k))) throw Error('Unsafe test SQL identifier')
    try {
      const values = Object.values(args).map(v => v !== null && typeof v === 'object' ? JSON.stringify(v) : v)
      const params = Object.keys(args).map((k, i) => `${k} => $${i + 1}`).join(',')
      const result = await db.query(`select public.${name}(${params}) as result`, values)
      return { data: result.rows[0].result, error: null }
    } catch (error) { return { data: null, error: { message: error.message } } }
  }
  const store = new DeliveryStore({ rpc })
  await store.rpc('delivery_demo_account', { p_config: demoConfig })
  let now = START
  const providers = createDeliveryProviders({ busy: ctx => store.busy(ctx), fetch: () => { throw Error('Demo attempted network access') } })
  const h = {
    db, store, providers,
    get now() { return now },
    advance(hours) { now = new Date(Date.parse(now) + hours * 3600_000).toISOString(); return now },
    async intake(overrides = {}) {
      return store.intake({ accountId: DEMO, externalId: crypto.randomUUID(), name: 'Fictional homeowner', phone: '0400000001',
        facts: {}, consent: { sms: true, wording: 'Demo permission only', source: 'demo', recordedAt: now },
        attribution: { source: 'google_search', campaign: 'demo-ducted-replacement' }, ...overrides }, now)
    },
    async reply(id, body, extra = {}) {
      const snapshot = await store.snapshot(DEMO, id)
      return store.receive({ accountId: DEMO, enquiryId: id, providerId: crypto.randomUUID(), phone: snapshot.enquiries[0].phone, body, stop: isOptOut(body), ...extra }, now)
    },
    run(overrides = {}) { return runDeliveryWorker({ store, providers, clock: () => now, accountId: DEMO, limit: 50, ...overrides }) },
    async get(id) { return (await store.snapshot(DEMO, id)).enquiries[0] },
    close() { return db.close() }
  }
  return h
}

export const qualifiedFacts = { service: 'ducted_replacement', suburb: 'Ryde', homeowner: true, timeframe: 'next month', address: '10 Example Street, Ryde' }
