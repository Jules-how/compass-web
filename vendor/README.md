# Compass-Web deployment mirror

`compass-core/` is a deployment mirror of the canonical package at
`packages/compass-core/`. Vercel uploads this app directory without its
monorepo parent, so keep the mirror source-identical and update both only from
the canonical package.
