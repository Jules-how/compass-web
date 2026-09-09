import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require = createRequire(import.meta.url)
/** Execute the actual production module, injecting only external boundaries. */
export function loadTypescript(file, stubs = {}, cache = new Map()) {
  const absolute = path.resolve(file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const module = { exports: {} }
  cache.set(absolute, module)
  const localRequire = (specifier) => {
    if (Object.hasOwn(stubs, specifier)) return stubs[specifier]
    if (specifier === 'server-only') return {}
    if (specifier === '@switchflow/compass-core') return loadTypescript('vendor/compass-core/src/index.ts',stubs,cache)
    if (specifier.startsWith('.') || specifier.startsWith('@/')) {
      let target = specifier.startsWith('@/')
        ? path.resolve('src', specifier.slice(2))
        : path.resolve(path.dirname(absolute), specifier)
      if (!path.extname(target))
        target += fs.existsSync(target + '.ts') ? '.ts' : '.tsx'
      if (target.endsWith('.ts') || target.endsWith('.tsx'))
        return loadTypescript(target, stubs, cache)
      return require(target)
    }
    return require(specifier)
  }
  const result = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true
    }
  })
  new Function('require', 'module', 'exports', result.outputText)(
    localRequire,
    module,
    module.exports
  )
  return module.exports
}
