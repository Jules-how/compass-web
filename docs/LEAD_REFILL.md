# List refill from Compass

Query `lead_contacts` here before scraping. The store already has uncontacted shops by trade and suburb.

Local: `http://localhost:3100`. Live: `COMPASS_BASE_URL`. Auth on every `/api/agent/*` call:

```http
Authorization: Bearer $COMPASS_AGENT_SECRET
```

`x-compass-agent-secret` is accepted too. Cookie session is for the operator UI only.

## Calls

| Step | Request | Why |
| --- | --- | --- |
| 1. Inventory | `GET /api/agent/leads?view=counts&vertical=plumber` | Totals live under `totals`. `byVertical[].byState` is only useful when state is filled. |
| 2. Pull | `GET /api/agent/leads?view=rows&columns=cohort&vertical=plumber&city=Narangba&outbound_status=uncontacted&completeness=has_email&bucket=leads&limit=2000` | One filter string. Page with `cursor` if `next_cursor` is set. |
| 3. Export | Same GET, or add `Accept: application/x-ndjson` | Write the JSON/ndjson yourself. There is no agent CSV route. Operator UI uses `GET /api/leads/list?...&limit=5000` (cookie) then Export CSV. |
| 4. Add | `POST /api/agent/leads` | Only for new published emails. `{ defaults?, rows[], on_conflict: "email" }`. Email match updates. Company domain or company+city is `company_dupe` (no insert). Never invent email. |

```bash
curl -sS "$COMPASS_BASE_URL/api/agent/leads?view=counts&vertical=plumber" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"

curl -sS "$COMPASS_BASE_URL/api/agent/leads?view=rows&columns=cohort&vertical=plumber&city=Narangba&outbound_status=uncontacted&completeness=has_email&bucket=leads&limit=2000" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"

curl -sS -X POST "$COMPASS_BASE_URL/api/agent/leads" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"defaults":{"vertical":"plumber","source":"apify"},"rows":[{"email":"shop@example.com.au","company":"Example Plumbing","city":"Narangba","state":"QLD"}],"on_conflict":"email"}'
```

MCP twins: `leads.search` and `leads.commit`. Deprecated aliases: `GET /inventory` (counts), `GET /cohort` (still requires `pipeline_campaign_id`), `PATCH /mark`.

## Params that matter

- `vertical` matches aliases (`plumber` = plumbers / plumbing).
- `city` is case-insensitive substring. `Brisbane` matches East Brisbane. Most rows store suburb, not metro, so `city=Sydney` will miss the list.
- `state` is often blank. Do not require it for a refill.
- `bucket=leads` hides archived. Omit it and you will pull archived rows.
- `columns=lean|cohort|full`. Use `cohort` for Instantly land.
- `limit` default 2000, transport max 5000. Page with `cursor` (`email` + `id` keyset).
- `pipeline_campaign_id=none` for unattached harvest.

## Do not

- Re-scrape a trade/city Compass already has as uncontacted with email.
- Treat `view=counts` top-level keys as the totals. Read `totals.uncontacted` / `totals.uncontactedWithEmail`.
- Use Instantly MCP to load Instantly. On this Mac, do not `POST /api/agent/instantly/push-leads` either: Instantly REST add-leads from here returns Cloudflare 1010. This Mac uploads the mill CSV on the campaign Leads tab with Browser Use (`instantly-load` skill). Hosted Compass / cloud agents may still push-leads.
- Activate Instantly from this app.
