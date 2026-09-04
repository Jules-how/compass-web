# Compass page-load and nav speed

Owner: this file. UI lock still applies (sidebar motion, depth, rounding). Speed work must not restyle chrome.

## Optimal outcome

Jules is in Sydney. Compass is a one-operator console. The bar is Linear-like, not a marketing Lighthouse score.

1. **Sidebar click (list surfaces).** The visible pane swaps in under 100ms. URL updates in the background. No blank main column. No waiting on RSC to acknowledge the click.
2. **First visit to a list surface.** A skeleton that matches Compass cards shows immediately. Data from Compass/Supabase lands without waiting on Instantly or digest jobs.
3. **Home.** First meaningful paint from `/api/home` in well under 2s on a warm function (was 9.2s). Morning remaining-counts from Instantly fill in after, without blocking the plate.
4. **Cold `/home` HTML.** Under ~1.5s TTFB from Sydney after region pin (was 4.1s cold).
5. **JS.** Home does not download Outbound, Offers, Recharts, or other desks. Those load on first visit to that surface.
6. **Repeat visits.** Keep-alive + short private HTTP cache. Switching Home ↔ Inbox ↔ Sales ↔ Tasks feels instant.
7. **Detail routes** (`/clients/[id]`, editors). `loading.tsx` so the click is acknowledged; data can take longer.
8. **Look.** Unchanged: wash, cards, Geist, orange accent, 72↔248 sidebar.

## Why it was slow (evidence, 4 Sep 2026)

### Geography
- Functions: Vercel `iad1` (Washington).
- Database: Supabase `ap-northeast-2` (Seoul).
- User: Sydney edge `syd1`.
- One query ≈ Sydney→Virginia→Seoul. Chatty APIs multiply that.

### `/api/home` at 9.2s
- `loadHomePayload` **awaited** `refreshEvidenceIfStale` (QBO/evidence matching) before anything else.
- `countByColumn` did `select(pipeline_stage)` with **no limit** on `lead_contacts` / `compass_clients`.
- Home `Promise.all` included `loadMorningWavePayload`, which **serial** Instantly `getKey` then live board, then DB. Instantly sat on the critical path for the whole plate.

### Page changes
- `(console)/layout.tsx` is `force-dynamic` and `await requireOperatorPageAccess()` (Supabase `getUser`) on every RSC navigation.
- No `loading.tsx`, so App Router keeps the old screen until RSC returns (~1s+ Sydney→iad1).
- Keep-alive covered Home/Inbox/Sales/Offers/Outbound/CRM only. Tasks, Projects, Clients, Ops still waited on RSC.
- Mount still `router.prefetch`’d **every** operator href, each a force-dynamic layout + auth on iad1.

### Bundle
- `ConsoleHomeInboxKeepAlive` statically imported Outbound, Offers, Sales (Recharts), Leads, Inbox, Home. One 593KB shared chunk on every console page. No `next/dynamic` anywhere.

## Plan (this is the work)

### A. Put functions next to the database
`vercel.json` `regions: ["icn1"]` (Seoul). Cuts query RTT. Instantly is still US; it must not block first paint.

### B. Make `/api/home` a fast DB read
1. Do not await evidence refresh. Run it with `after()`.
2. Count stages with `head: true` + `count: exact` in parallel, not a full table download.
3. Home wave from Compass tables only. Live Instantly board on `GET /api/home/wave` so the plate can paint first.

### C. Instant sidebar
1. Keep-alive every operator **list** href (Tasks, Projects, Functions, Clients, Finances, Installs, Retention, plus existing Sales surfaces). Detail/editor/settings stay RSC.
2. Dynamic-import every desk/panel so Home’s JS is not the whole console.
3. Stop mount-time prefetch of all RSC routes. Prefetch Home + Inbox only; hover still warms APIs.
4. Add `(console)/loading.tsx` for remaining RSC (settings, `[id]`, editors).

### D. Sales overview / spine counts
Same head-counts. Do not wait on Instantly to start the CRM + spine reads.

### E. Package imports
`optimizePackageImports` for `lucide-react`, `framer-motion`, `recharts`.

### F. Verify

Measured on hosted `https://compass-web-eosin.vercel.app` after the icn1 deploy (4 Sep 2026, from Sydney):

| Request | Before | After |
| --- | --- | --- |
| `GET /api/home` | 9.2s | 1.8s first / **0.93s warm** |
| `GET /api/tasks` | 1.2s | **0.30s** |
| `GET /api/inbox` | 1.3s | **0.69s** |
| Home console JS chunk | 593 KB | **168 KB + 34 KB** (Outbound/Recharts split off) |
| Functions | `iad1` | **`icn1`** (Seoul, next to Supabase) |

Warm `/home` HTML TTFB is ~1.0s. First hit after idle can still be ~3–4s (Hobby cold start). Sidebar list surfaces keep-alive so clicks do not wait on that RSC hop.

Contract tests for this work and `tsc --noEmit` pass.

## Still open (not on the Home/nav critical path)

From the render-path and data-waterfall audits after the first ship. Do these when Jules wants another pass:

- Inbox tab/id URL used to `router.replace` (second RSC on every Inbox click). Local tree now uses `history.replaceState`; needs a deploy to land on hosted.
- `listPipelineCampaigns` still pulls up to 8k lead rows for tallies. Same pattern on campaign queue, agent brief, offers desk, targeting map.
- Agent brief still stacks a second 8k scan plus Instantly morning wave.
- Duplicate Instantly analytics fetch in `agent-sync`.
- `acceptTemplateProposal` writes leads one id at a time.
- Layout still `force-dynamic` + `getUser` (keep-alive hides it on list clicks; Settings/`[id]` still pay it).
- Inbox badge warm still fetches the full `/api/inbox` payload.
- Offers desk `limit 8000` lead rows.

## Out of scope unless Jules asks
- Moving Supabase out of Seoul.
- Restyling sidebar or cards.
- New Compass widgets, caps, or metrics dashboards.
- Virtualizing every table.
- Next 16 Cache Components / PPR (layout is session-gated; not a static site).
