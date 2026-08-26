# Voice + SMS delivery (Wave 2)

Missed-call booking: Retell voice on Twilio AU mobile, SMS on the same number, Google Calendar via share grant.

## Platform setup (once, ~2 hours)

### 1. Twilio Elastic SIP trunk

1. Create trunk in Twilio Console → Elastic SIP Trunking.
2. **Origination**: SIP URI `sip:sip.retellai.com`.
3. **Termination**: allowlist Retell SBC `18.98.16.120/30`.
4. Enable **REFER** and PSTN transfer for owner cold transfers.
5. Note `TWILIO_SIP_TRUNK_SID` for provisioning.

### 2. Retell master agent

1. Create conversation flow per `voice-agents/master-agent.md`.
2. Bind tools URL: `https://{COMPASS_HOST}/api/voice/tools`.
3. Post-call webhook: `https://{COMPASS_HOST}/api/voice/postcall`.
4. Note `RETELL_MASTER_AGENT_ID`.

### 3. Environment (Compass / Vercel)

| Variable | Purpose |
| --- | --- |
| `RETELL_API_KEY` | Retell API |
| `RETELL_MASTER_AGENT_ID` | Master agent bound to imported numbers |
| `RETELL_WEBHOOK_SECRET` | Verify inbound/tools/postcall signatures |
| `TWILIO_ACCOUNT_SID` | Twilio REST |
| `TWILIO_AUTH_TOKEN` | Twilio REST + SMS signature verify |
| `TWILIO_SIP_TRUNK_SID` | Attach purchased numbers to trunk |
| `GOOGLE_BOOKING_SERVICE_ACCOUNT_JSON` | Service account key JSON (calendar writer) |
| `BOOKING_GRANT_EMAIL` | Shown in onboarding (default `bookings@switchflow.agency`) |
| `COMPASS_PUBLIC_URL` | Public hostname for webhooks (no protocol) |
| `VOICE_PACKS_DIR` | Optional override; default `../voice-agents/packs` |

### 4. Google Calendar grant

Clients share their booking calendar with the service account email as **Make changes to events**. Probe runs on provision.

## Per-client runbook (~80 min)

| Step | Time | Action |
| --- | --- | --- |
| Onboarding form | 10 min | Owner submits: trade, calendar ID, owner mobile, public number, carrier |
| Provision | 15 min | `node scripts/provision-voice-client.mjs --client-id … --pack plumbing_gas --calendar …` |
| Forwarding card | 10 min | Owner dials carrier codes from CLI output (no-answer + busy) |
| Calendar probe | 5 min | Confirm `voice.probe_ok` in Compass |
| Test call | 15 min | Call public number, no answer → agent books or callbacks |
| Test SMS | 10 min | Text Twilio number, complete suburb/job/time flow |
| STOP test | 5 min | Reply STOP, confirm ack + suppression |
| Go-live | 10 min | Mark `forwarding_confirmed_at`, set `live_at` when checklist green |

Dry run (no keys): add `--dry-run` to print forwarding card only.

## Go-live gate

All must pass before `voice.live_at`:

- Twilio number + Retell agent provisioned
- Calendar probe OK (`probe_ok`, not `calendar_grant_broken`)
- Owner confirmed forwarding (`forwarding_confirmed_at`)
- Test call with outcome `booked` or `callback_captured` in `compass_voice_calls`
- Test SMS booking completed
- STOP honoured

Use **ClientVoicePanel** in the client detail view for the checklist.

## API endpoints

| Route | Auth | Role |
| --- | --- | --- |
| `POST /api/voice/inbound` | Retell signature | Return dynamic variables |
| `POST /api/voice/tools` | Retell signature | Booking tools |
| `POST /api/voice/postcall` | Retell signature | Persist call + recovery SMS |
| `POST /api/voice/sms` | Twilio signature | Inbound SMS state machine |
| `GET /api/clients/:id/voice` | Operator session | Status + recent calls |

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Agent answers but no client context | Inbound webhook miss / wrong `to_number` | Check `voice.twilio_number` E.164 match |
| `calendar_ok: false` | Grant revoked or wrong calendar ID | Re-share calendar; clear `calendar_grant_broken` |
| Retell never rings | Voicemail wins no-answer race | Disable MessageBank; extend ring timer |
| SMS no reply | Wrong Twilio messaging webhook URL | Point to `/api/voice/sms` |
| Recovery SMS not sent | Suppressed or non-mobile caller | Check `sms_suppressions` |
| Double booking | Concurrent calls | v1 in-process lock; offer next slot on conflict |

## Trade packs

Canonical home: `voice-agents/packs/{plumbing_gas,hvac_refrig,electrical_av,roofing}.json`. New trade = new pack file, not code.

Master agent spec: `voice-agents/master-agent.md`.

## UI mount

Add to `ClientDetailPanel` (Delivery or Overview tab):

```tsx
import { ClientVoicePanel } from '@/components/ClientVoicePanel'
// ...
<ClientVoicePanel clientId={client.id} />
```
