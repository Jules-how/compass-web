# Compass Core

Pure TypeScript contracts and deterministic merge/hash inputs shared by Compass desktop and
Compass-Web. The package has no Electron, database, filesystem, environment, or app imports.

The apps consume the TypeScript source through `file:../../packages/compass-core`; Electron Vite
and Next.js perform the emitted application builds. The package `build` command is therefore a
compile-validation build and emits no standalone artifact.

From a fresh clone, install the package before either linked app so TypeScript can resolve Zod from
the package's real path:

```bash
npm ci --prefix packages/compass-core
npm ci --prefix apps/compass
npm ci --prefix apps/compass-web
```

Package validation:

```bash
npm run typecheck --prefix packages/compass-core
npm run build --prefix packages/compass-core
```
