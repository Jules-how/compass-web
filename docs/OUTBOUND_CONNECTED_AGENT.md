# Connected agent execution

The first release uses an explicitly connected agent. Queuing a saved workflow in Compass freezes its scope and persists work; it does not spawn a model or continue while the agent host is offline. The same run survives disconnects. Hosted unattended execution is a later milestone. Agents follow the saved tools, ordering, permitted fallback outcomes and budget. They cannot approve checkpoints or activate a campaign.

## Connect and inspect

Use `outbound.pipeline.capabilities`, `outbound.pipeline.executor`, and `outbound.pipeline` MCP tools. If an existing MCP process has not reloaded, use the corresponding authenticated HTTPS `/api/agent/outbound/pipeline` routes. Read `docs/OUTBOUND_PIPELINE.md` for packet schemas. Never print the secret.

Before work, inspect the current immutable workflow/template version, the run and remaining budget, and the actual tools available in this agent host. Map saved IDs to concrete adapters (for example `parallel.extract` to the currently connected Parallel extract tool). A tool name in a workflow is not proof it is installed or authenticated. Probe the actual adapter with a read-only capability/account check, or reuse a recent confirmed successful operation. Do not make paid prospect requests merely to check credentials. If no free probe exists, mark unavailable with the remedy; preserve the saved configuration.

Register through `outbound.pipeline.executor` using:

```json
{"command":{"action":"register","request_id":"stable-uuid","session_id":"host-session-uuid","expected_revision":0,"data":{"name":"Connected research agent","tools":[{"id":"http.fetch","stages":["research","contacts"],"adapter_version":"1","tool_name":"actual host HTTP reader","probe":{"status":"ready","checked_at":"CURRENT_ISO_TIMESTAMP","detail":"Read-only public-page probe succeeded"}}]}}}
```

The server accepts fresh probes within ten minutes and expires presence after ten minutes. Heartbeat renews presence, not a probe. Re-register with a fresh probe and current revision when needed. A readiness report contains no API key, raw authorization headers or private tool response. The UI identifies these as checks by the connected agent.

## Work one bounded item

1. Read the run and use its current revision to `claim`. A claim returns one work item, lease token, lease expiry and updated run revision. If there is no claimable work, inspect checkpoint/blocked/uncertain reasons; never reset status by generic writes.
2. Attach your session to that exact work item and lease using executor action `attach`, data `{item_id,lease_token}`, current session revision and a stable request ID. A provider reservation fails unless this lease is attached to an available, recently checked adapter supporting the saved stage.
3. Read company input revision, saved criteria and signal definitions, evidence and contact candidates. Follow every cursor. Reuse source artifacts and observations only within the saved cache age and field scope. Separate evidence quality from personalisation usefulness. Conflicting/unsupported material stays unknown and cannot fill writing slots.
4. Before dispatch, reserve a saved tool attempt with its stable provider request ID, maximum expected cost and exact currency. Inspect the receipt before calling the provider. Enforce its scope and fallback outcome. If the tool is unavailable, stop that item with an actionable reason; availability is distinct from an empty search result. Do not substitute another tool or estimate invented contacts.
5. Execute only that adapter and scope. Store source URL, exact quote/locator, fetch/observation times, artifact reference and actual provider result. Use CRM API packets for canonical people/methods/verification and pipeline packets for configured signal/fit/draft records. Missing role/person attribution remains unresolved. Verification of an address does not establish its owner.
6. Report duration, actual cost when known, provider request identity, source IDs and structured outcome. Unknown cost remains unknown. A timeout after submission is uncertain: reconcile the same provider request before retrying. Cancellation stops new calls but still permits reporting already submitted work.
7. Finish the item with persisted output IDs (assessment, recipient, verification or exact saved draft) or a held/failed reason. The database validates those references. Heartbeat a long-running item before its lease expires; after restart resume using receipts and lease state, not a new copy of the whole list.

For deterministic writing, use `renderPipelineTemplate` from `outbound-pipeline.ts` with only currently supported eligible signals. An AI template must use its saved model and prompt; if unavailable, hold it. Persist the result once; export reads the persisted draft. Regenerating during export is prohibited. A required missing slot holds the draft; an optional slot uses its saved fallback.

## Bulk edits and delivery

Template changes use a frozen impact preview and chunked apply job, including manually edited drafts. A changed draft since preview conflicts rather than being overwritten without review. General company/recipient exports are not sending approval.

Paused delivery uses the canonical preparation manifest and operator approval. On this Mac the transport is the finished CSV through the connected Chrome session; follow `.agents/skills/instantly-load/SKILL.md` in the workspace. No local REST/MCP add-leads, `land`, `push-leads` or campaign activation. Resume provider readback to actual completion and reconcile every intended/held/duplicate/extra recipient plus exact copy, sequence, sender/settings/schedule. Report loaded and checked separately from sent. The software implementation itself is not permission to spend or upload a live cohort.
