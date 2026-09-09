/** Local fixture preview: real route/chrome/CSS and delivery engine; no production data or providers. */
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { harness, DEMO, START, qualifiedFacts, source } from '../test/helpers/delivery-harness.mjs'

const root = resolve(import.meta.dirname, '..')
const output = await mkdtemp(resolve(tmpdir(), 'compass-delivery-shell-'))
const { operatorCommandSchema } = source('src/lib/delivery-engine/http.ts')
const { validateOutcome } = source('src/lib/delivery-engine/rules.ts')
const h = await harness()
await h.db.query('update delivery_accounts set demo_now=$1 where id=$2', [START, DEMO])
await h.intake({ name: 'Demo homeowner', facts: qualifiedFacts })
await h.intake({ name: 'Outside-area demo', phone: '0400000003', facts: { ...qualifiedFacts, suburb: 'Outside demo area' } })
await h.run()

// Only browser framework/auth plumbing is substituted. Shell, sidebar, nav, page and tokens are imported unchanged.
const files = {
  'entry.tsx': `import React from 'react'; import { createRoot } from 'react-dom/client';
    import Page from '${root}/src/app/(console)/operations/delivery/page';
    createRoot(document.getElementById('root')!).render(<Page/>);`,
  'navigation.ts': `const router = { prefetch() {}, push(href: string) { window.location.assign(href) }, refresh() { window.location.reload() } };
    export const usePathname = () => window.location.pathname;
    export const useRouter = () => router;`,
  'link.tsx': `import React from 'react'; export default function Link({ href, prefetch, replace, scroll, ...props }: any) { return <a href={href} {...props}/> }`,
  'auth.ts': `export const useAuth = () => ({ signOut: async () => {} });`,
  'inactive-pages.tsx': `export const ConsoleHomeInboxKeepAlive = () => null;`,
  'index.html': `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Compass · Client delivery · Local demo</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/app.css">
    <style>${[['Regular',400],['Medium',500],['SemiBold',600],['Bold',700]].map(([name,weight]) => `@font-face{font-family:Geist;src:url('/Geist-${name}.woff2');font-weight:${weight};font-display:swap}`).join('')}
    :root{--font-geist-sans:Geist}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`
}
await Promise.all(Object.entries(files).map(([name, body]) => writeFile(resolve(output, name), body)))
execFileSync('npm', ['exec', '--yes', '--package=esbuild@0.25.12', '--', 'esbuild', resolve(output, 'entry.tsx'),
  '--bundle', '--format=esm', '--jsx=automatic', '--minify', `--outfile=${output}/app.js`,
  `--tsconfig=${root}/tsconfig.json`, '--define:process.env.NODE_ENV="production"',
  `--alias:react=${root}/node_modules/react`, `--alias:react-dom=${root}/node_modules/react-dom`,
  `--alias:next/navigation=${output}/navigation.ts`, `--alias:next/link=${output}/link.tsx`,
  `--alias:@/components/AuthProvider=${output}/auth.ts`,
  `--alias:@/components/ConsoleHomeInboxKeepAlive=${output}/inactive-pages.tsx`
], { cwd: root, stdio: 'inherit' })
execFileSync(resolve(root, 'node_modules/.bin/tailwindcss'), ['-i', 'src/app/globals.css', '-o', `${output}/style.css`, '--minify'], { cwd: root, stdio: 'inherit' })

async function command(input) {
  const c = operatorCommandSchema.parse(input)
  if ('accountId' in c && c.accountId !== DEMO) throw Error('Demo account only')
  let selectedEnquiry = c.enquiryId
  if (c.type === 'demo.start') {
    const complete = ['qualified', 'outside_area'].includes(c.scenario)
    selectedEnquiry = (await h.intake({ externalId: `demo:${c.key}`, name: 'Demo homeowner',
      phone: `+614${String(parseInt(c.key.slice(0, 6), 16)).padStart(8, '0')}`,
      facts: complete ? { ...qualifiedFacts, ...(c.scenario === 'outside_area' ? { suburb: 'Outside demo area' } : {}) } : {},
      consent: { sms: c.scenario !== 'no_permission', wording: 'Fictional local demo', source: 'demo', recordedAt: h.now }
    })).id
  } else if (c.type === 'demo.reply') await h.reply(c.enquiryId, c.body)
  else if (c.type === 'demo.advance') {
    await h.store.rpc('delivery_demo_advance', { p_account_id: DEMO, p_hours: c.hours, p_key: c.key })
    h.advance(c.hours)
  } else if (c.type === 'operator' || c.type === 'outcome') {
    if (c.type === 'outcome') validateOutcome((await h.get(c.enquiryId)).state, c, h.now)
    await h.store.command(DEMO, c.enquiryId, c.key, c.type, { ...c, actor: 'local-preview' }, h.now)
  } else if (c.type !== 'run') throw Error('This action is not available in the local fixture preview')
  const result = await h.run()
  return { accountId: DEMO, selectedEnquiry, result, snapshot: await h.store.snapshot(DEMO) }
}

const assets = new Map(['/app.js', '/app.css', '/style.css'].map(path => [path, resolve(output, path.slice(1))]))
for (const weight of ['Regular', 'Medium', 'SemiBold', 'Bold']) assets.set(`/Geist-${weight}.woff2`, resolve(root, `node_modules/geist/dist/fonts/geist-sans/Geist-${weight}.woff2`))
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname
    res.setHeader('Cache-Control', 'no-store')
    if (path === '/api/delivery-engine') {
      res.setHeader('Content-Type', 'application/json')
      if (req.method === 'GET') { res.end(JSON.stringify(await h.store.snapshot(DEMO))); return }
      if (req.method !== 'POST') { res.writeHead(405).end(); return }
      const origin = req.headers.origin
      if (origin !== `http://${req.headers.host}`) { res.writeHead(403).end(); return }
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 16000) throw Error('Payload too large') }
      res.end(JSON.stringify(await command(JSON.parse(body)))); return
    }
    if (path.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ tasks: [], leads: [], total: 0, badgeTotal: 0 })); return }
    if (assets.has(path)) {
      res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'font/woff2')
      res.end(await readFile(assets.get(path))); return
    }
    res.setHeader('Content-Type', 'text/html')
    if (path === '/' || path === '/operations/delivery') res.end(await readFile(resolve(output, 'index.html')))
    else res.end('<p>This local preview includes Client delivery only. <a href="/operations/delivery">Return to delivery</a>.</p>')
  } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message })) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
console.log(`Local fictional demo: http://127.0.0.1:${server.address().port}/operations/delivery`)
console.log('Uses the actual Compass shell and page. State resets when stopped. No production auth, data or external providers.')
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { server.close(); await h.close(); process.exit(0) })
