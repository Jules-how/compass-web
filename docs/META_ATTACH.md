# Meta attach (Wave 5c)

Homeowner Meta lead-gen attach line. Compass drafts copy and creative brief from trade packs, pushes **PAUSED** objects to the **client-owned** ad account, then stops. Jules reviews and activates in **Meta Ads Manager** (no activate button in Compass v1).

## Flow

1. **Draft** — `POST /api/clients/:id/meta-attach` merges pack copy with client facts (business name, city from suburbs, phone from voice/delivery).
2. **Review** — Operator edits primary/headlines, pastes Canva design IDs after editing brand templates, adds exported PNG URLs, sets ad account + Page ID.
3. **Push paused** — `PATCH …/meta-attach/:attachId` `{ action: "push_paused", confirm: true }` creates campaign → ad set → image upload → creative → ad, all `status=PAUSED`, `special_ad_categories=[]`.
4. **Activate** — Deep link to Ads Manager. After activation, Compass does not change budgets, copy, or status (reports and recommends only).

Default destination: message-matched LP on switchflow-sites (`/lp/{slug}`) with client voice number wired on the site side.

## Driver config

Set `META_ATTACH_DRIVER`:

| Driver | Env | Use |
| --- | --- | --- |
| `composio` (default) | `COMPOSIO_API_KEY`, `COMPOSIO_META_ACCOUNT_ID` | Composio managed auth. Proxy: `POST https://backend.composio.dev/api/v3.1/tools/execute/proxy` ([docs](https://docs.composio.dev/reference/api-reference/tools/postToolsExecuteProxy)). |
| `direct` | `META_ACCESS_TOKEN` | Graph API v21+ from Compass server. |

Optional: `META_ACCESS_TOKEN` with composio driver enables image upload (multipart) while other calls use Composio proxy.

Optional: `SWITCHFLOW_SITES_BASE_URL` (default `https://switchflow.agency`) for default LP URLs.

If env is missing, push returns `503 driver_not_configured` with an honest message. No silent no-ops on push.

## What the system refuses

- **Activation** — no `activate` action; no API call sets `ACTIVE`.
- **Edits after live** — `live` attach rows are read-only in Compass.
- **Push without Canva** — at least one `canva_design_ids` value required.
- **Push without export** — at least one `review.exported_image_urls` entry required.
- **AI-only creative** — `review.ai_generated_only=true` blocks push.
- **Flat PNG as master** — operator path is Canva brand template → export → upload hash; design IDs stored on the row.

## Data

- Table: `compass_meta_attach` (migration `0073_compass_meta_attach.sql`)
- Packs: `funnels/meta-packs/{plumbing_gas,hvac_refrig,electrical_av,roofing}.json`

## Events (`compass_evidence_events`)

| Type | When |
| --- | --- |
| `meta.attach.draft_created` | Draft row inserted |
| `meta.campaign.created_paused` | Successful push (includes `meta_ids`, driver) |
| `meta.attach.archived` | Archive action |
| `ads.spend_day` | Reporter pull (yesterday insights) |
| `ads.lead` | Reporter pull |

Tags: `product=meta_attach`, `vertical`, `offer` from pack/row.

## UI mount

In `ClientDetailPanel` overview grid (not mounted by default):

```tsx
import { ClientMetaAttachPanel } from '@/components/clients/ClientMetaAttachPanel'
// …
<ClientMetaAttachPanel clientId={clientId} />
```

## Open questions

- Per-client ad account link: v1 uses manual `review.meta_ad_account_id` + Page ID in the panel. Future: map from partner OAuth / `compass_ad_accounts` per client.
- Composio image upload: proxy is JSON-only; composio driver falls back to `META_ACCESS_TOKEN` for `adimages` multipart.
- App Review / Full Access for client BM accounts may still block production pushes until Meta approves the Switchflow app.
