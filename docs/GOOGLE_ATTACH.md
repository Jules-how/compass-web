# Google Ads attach (Wave 5d)

Paused Search campaigns in **client-owned** Google Ads accounts linked under Switchflow's MCC. Lead gen only. Activation stays in Google Ads UI (no activate action in Compass v1).

Packs: `funnels/google-packs/{plumbing_gas,hvac_refrig,electrical_av,roofing}.json`.

## Flow

1. **Draft plan** — `POST /api/clients/:id/google-attach` reads `deal_terms.delivery` (trade, suburbs) + voice number, loads the trade pack, resolves merge fields (`{business}`, `{suburb}`, `{years}`), stores `compass_google_attach` row (`status: draft`).
2. **MCC invite** — Operator enters client customer ID (CID). `PATCH …/google-attach/:attachId` with `{ action: "invite_mcc" }` sends `CustomerClientLink` PENDING from the MCC.
3. **Client accepts** — Client admin accepts under Google Ads → Admin → Access and security → Managers. Compass polls `link_status` on GET.
4. **Push paused** — `{ action: "push_paused" }` mutates budget → PAUSED campaign → ad groups → keywords → RSAs → assets → shared negatives → conversion action. Idempotent via `google_ids`.
5. **Review & activate** — Jules opens Google Ads (deep link in UI), reviews, enables campaign there.
6. **Report** — Cron or manual job calls reporter (`ads.spend_day`, `ads.lead` evidence events). Recommend only after live.

## OAuth + developer token setup

Env vars (server):

| Variable | Purpose |
| --- | --- |
| `GOOGLE_ADS_CLIENT_ID` | OAuth client (Google Cloud Console) |
| `GOOGLE_ADS_CLIENT_SECRET` | OAuth secret |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Ads API developer token (Basic/Standard + ad management use) |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Switchflow MCC CID (no hyphens) |

Refresh token stored in `compass_settings` as `integrations.google_ads.refresh_token` (encrypted, same pattern as Google Calendar).

OAuth scope: `https://www.googleapis.com/auth/adwords`

Without env: draft plans work; invite/push return honest `google_ads_not_configured` errors.

### One-time operator setup

1. Create OAuth app in Google Cloud (Desktop or Web redirect to Compass callback if you add one later).
2. Apply for Google Ads API developer token on the MCC.
3. Complete OAuth once as the MCC admin; store refresh token via `compass_settings` upsert or a future settings UI.
4. Set `GOOGLE_ADS_LOGIN_CUSTOMER_ID` to the MCC CID.

## MCC accept path

Manager (Switchflow):

1. `CustomerClientLink` with `status: PENDING` for client CID.
2. Poll `customer_client_link.status`.

Client (shop owner):

1. Receives invite email or sees pending request in Ads UI.
2. Admin → Access and security → Managers → Accept.
3. Status becomes `ACTIVE`. Push paused requires ACTIVE.

API reference: [Linking to Manager Accounts](https://developers.google.com/google-ads/api/docs/account-management/linking-manager-accounts)

## Refusals and edge cases

| `link_status` | Meaning | Action |
| --- | --- | --- |
| `PENDING` | Waiting on client | Resend invite or follow up |
| `REFUSED` | Client declined | Stop; do not push |
| `CANCELED` | Manager withdrew | Send new invite |
| `INACTIVE` | Link ended | Re-link before push |

Other risks:

- Explorer token cannot create client accounts or heavy mutate batches.
- Client must have billing on the Ads account before anything can serve (push still works PAUSED).
- Conversion action names must be unique per account.
- Call conversions without Google forwarding numbers need website/call events, not upload-only call import.

## Database

Migration `0074_compass_google_attach.sql`. RLS: `portal_is_operator()` (same as `compass_qbo_docs`).

## API routes

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/clients/:id/google-attach` | List attaches + link status poll |
| POST | `/api/clients/:id/google-attach` | Draft plan |
| PATCH | `/api/clients/:id/google-attach/:attachId` | `invite_mcc` \| `push_paused` \| `archive` |

No `activate` action.

## Library

| Module | Role |
| --- | --- |
| `src/lib/google-attach/pack.ts` | Pack loader |
| `src/lib/google-attach/plan.ts` | Plan generator |
| `src/lib/google-attach/plan-core.mjs` | Pure helpers + char limits (tests) |
| `src/lib/google-attach/oauth.ts` | Refresh token storage |
| `src/lib/google-attach/api.ts` | REST client (searchStream + mutate) |
| `src/lib/google-attach/mcc.ts` | MCC invite + poll |
| `src/lib/google-attach/mutate.ts` | Push paused graph |
| `src/lib/google-attach/reporter.ts` | Spend/lead evidence |
| `src/lib/google-attach/service.ts` | Route orchestration |

Override pack path: `GOOGLE_PACKS_DIR`.

## Events

Source: `google_attach`. Key types from research pack: `google.mcc.invite_sent`, `google.mcc.link_active`, `google.campaign.created_paused`, `google.attach.ready_for_review`, `ads.spend_day`, `ads.lead`.

## UI

Component: `src/components/clients/ClientGoogleAttachPanel.tsx`. Not mounted by default.

## Doctrine (locked)

- SEARCH only. No PMax.
- Client-owned account under Switchflow MCC.
- Tightly themed ad groups, shared negatives, 2 RSAs per group, sitelink/callout/call assets, one conversion action.
- Everything PAUSED on push. Jules activates in Google Ads.

## Open questions

1. OAuth callback route for operator vs one-time manual token seed?
2. Per-client OAuth to auto-accept MCC (product choice; manager-only invite is current path).
3. Geo targeting: campaign location radius from `service_suburbs` not yet in mutate batch.
4. Keyword Planner refresh per CID before first enable (manual step).
