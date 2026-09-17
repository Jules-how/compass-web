# Copy Control — release verification

## Scope and baseline

Implementation prepared from `main` commit `9f533a3fc8e0f259fb1763fea0a413b61c886019` (PR #94), on `feat/write-copy-control-studio`. Existing authentication, recipient approval, export readiness, list membership and immutable pipeline command contracts are preserved. No database migration is required. No production lead data was modified and no outreach emails were sent during implementation.

The full product specification is `docs/COPY_CONTROL_SPEC.md`. It distinguishes implemented behaviour from upstream workflows retained unchanged and integrations still outstanding.

## Verification performed before publication

- `npm run verify`: deployment guards and TypeScript passed.
- 189 automated tests passed, zero failures. This includes Copy Control rendering, routing, API boundaries, frozen jobs, attribution, real PGlite database/RPC integration, outbound pipeline/preparation/workshop, workspace/video-feedback regressions, service-role boundaries, lead lists, campaign workspace/reconciliation, publication and MCP tests.
- `npm run build`: Next.js production compilation, lint/type validation, page-data collection and route generation passed using non-secret build placeholders.
- 20 browser interaction checks passed with no page errors. Tests mounted the actual WriteEditor and CopyControlStudio components with mocked network/session data, exercised editing, variables, AI configuration, forced/automatic/synthetic previews, immutable version saving and a 390px viewport without document-wide horizontal overflow.
- The existing service-role boundary inventory was extended for precisely the two new protected routes; authentication assertions were not weakened.
- Database integration tests verified immutable versions/drafts, persisted attribution, event identity conflicts and export columns using the existing migrations and command functions.

## Boundaries of verification

The component browser tests are not an authenticated production end-to-end test. Real Supabase user-session interactions, paid AI generation against the deployed provider, real campaign outcome imports, a complete production bulk-copy run and downstream Instantly campaign delivery were not exercised. The production build alone does not establish these integrations work with the deployed account configuration.

AI generation is explicit, server-side, bounded, reviewed and requires a configured AI gateway/model. Selected signal provenance does not prove that a free-form model semantically used every input or introduced no unsupported implication. Human review remains required.

Results initially use explicit outcome-event imports via the UI or protected agent endpoint. Automatic provider message-event synchronisation is not included. Export and approval remain separate from writing. No automatic sending or campaign activation was added.

## Release gates

The feature branch must pass GitHub checks and reach a READY Vercel preview for the exact implementation commit before merge. Production verification must check the merged commit's deployment and aliases, and record any access barrier rather than removing authentication. The GitHub PR and deployment records are the authoritative publication evidence; this pre-publication record does not itself assert that merging or deployment occurred.

## Rollback

Revert the feature merge through a normal PR and redeploy the resulting main commit, or temporarily promote the preceding known-good Vercel production deployment. Do not delete saved drafts, evidence events, template versions or lead data. Existing legacy template versions remain available. New component-policy versions should not be edited or flattened in place; deliberately select a legacy version when operating an older application release.
