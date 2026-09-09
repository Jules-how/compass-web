---
name: instantly-load
description: >-
  Load a finished Switchflow cold email list into Instantly as a draft campaign.
  Use when creating or updating an Instantly campaign, uploading leads, or
  Jules says load the list into Instantly. Not for list building, openers, or copy.
---

# Instantly load

Fetch Instantly tool schemas before any campaign create or `get_campaign`. Pull one live campaign in the same motion for senders and tracking only. Do not copy its delays if they break the gap rule.

Do not add leads through Instantly MCP, Instantly REST `/leads/add`, or Compass `land` / `push-leads`. Instantly REST add-leads from this Mac returns Cloudflare 1010. Compass Instantly push uses that same API. Lead upload is Browser Use on the campaign Leads tab.

## Stops

- Openers file exists at `cold-email/openers/out/{trade}/{trade}-{city}-sendable-{YYYYMMDD}.csv`. Every row has email, `opener`, `subject`, a recorded verification result, and fresh Compass eligibility: `outbound_status=uncontacted`, not archived, recontact allowed, no suppression or ICP skip, and membership in the intended cohort. Use the current ledger; older verification results do not override those exclusions. Never invent an email. Do not write Instantly JSON, pipeline, or quarantine files into `openers/out/`. Retain the approved transport artifact and import receipt with the preparation; do not delete raw source or receipt files automatically.
- Do not activate unless Jules said go. Load means draft. Never click Launch.
- One city, one campaign. Do not attach this list to another city’s campaign.

## Order

0. Resolve the active offer and cell with `factory_job.py`. For `installation-booking`, use the exact frozen preparation approved in Compass, including its sequence, opener recipe, senders and schedule. If the preparation is missing or stale, finish it first. No historical fill/capture fallback. An old copy confirmation is not approval for a new batch.
1. Create an empty Instantly lead list if the create flow needs one. Do not upload the CSV onto that list.
2. Create the campaign in draft with Instantly MCP. PATCH `insert_unsubscribe_header` true. `get_campaign` for delays and copy.
3. Upload leads with Browser Use while Jules is signed in on local Chrome.
4. For installation-booking, use preparation reconciliation after upload: it reads the actual paused campaign, compares the entire inbox set and merge values, and marks only confirmed IDs. Do not PATCH the approved sequence after loading or manually mark the cohort. For historical workflows, reconcile actual inboxes before marking only confirmed IDs.

Open `https://app.instantly.ai/app/campaign/{id}/leads`. Click Upload CSV. Attach a scratch CSV (absolute path, `/tmp` is fine). Map `email` → Email, `first_name` → First Name, `company_name` → Company Name, `personalization` → Personalization. Map every other column to Custom Variable so `opener`, `companyShort`, `service`, `subject`, `city`, `suburb` land. Duplicates: Campaigns on, Lists off, The Workspace off. Verify leads off (the list is already verified; catch-all rows must stay). Click UPLOAD ALL. Do not also upload to a list.

`skip_if_in_campaign` is the Campaigns checkbox. Leave workspace skip off unless Jules asked to dedupe the whole workspace.

## Delay

Instantly Wait is `delay` on the email above the Wait box. The MCP line “days before this step” is wrong here.

Every send to the next email is 2 or more days. Put `delay: 2` on every email that has a following email. Last email `delay: 0`.

Two emails: email 1 delay 2, bump delay 0. Three emails: 2, then 2, then 0.

After create, `get_campaign`. If any gap before the last email is under 2, fix it before you say loaded.

## Campaign

- Name: use the current campaign cell name and active offer. One sequence per campaign. Do not name a new installation-booking campaign fill/capture.
- Timezone is that city.
- Weekdays by default. Weekends only when Jules directs that vertical.
- Reuse the current HVAC sender pool. Do not invent mailboxes.
- Daily cap sized to the list.
- `stop_on_reply` on. Open and link tracking off. `text_only` on.
- Unsubscribe on every email. Header plus a visible body link. Header alone is not enough.

`insert_unsubscribe_header` is not on the create schema. After create, PATCH `{"insert_unsubscribe_header": true}`, then `get_campaign`. If that flag is still false, Jules turns on Campaign Options > Insert unsubscribe link header. Do not ship a draft with it off.

## Sequence

Email 1 starts with `{{personalization}}`. Do not put `{Hi|Hey} {{firstName}},` on the campaign. Named leads already have `Hi {name},` inside personalization. Unnamed leads have a blank `first_name` and personalization that starts at `Saw`.

The opener CSV may still start `Hi Mark,`. Keep that on named rows. Strip `Hi` / `Hey` / `Hello` from unnamed rows so they start at `Saw`. Never upload `there` or `{shop} team` as a first name.

Paste the complete approved Compass sequence, including signature and visible unsubscribe link. The frozen subject may be literal or `{{subject}}`. No inferred job counts, guarantees, new claims or historical body substitutions.

Do not use the killed missed-call body (Framework B: catch and book those calls / 3 jobs on the calendar). Banned 26 Aug and still banned. Do not load this sequence into Instantly `HVAC | Sydney | 300 | Sept26` unless Jules names that campaign.

Bump is 2+ days later. Omit a first-name greeting: many valid rows have no published person name. Subject is blank (threads as `Re: {{subject}}`). No website or booking link. Do not use `reply no`, “who handles a new enquiry,” freeze language, or a 90 day / refund retainers (plural) line.

Every email ends with Instantly `{{unsubscribe}}` labelled `Unsubscribe`. That is the only link allowed.

## Leads

Build a scratch CSV (not under `openers/out/`) with `email`, `first_name`, `company_name`, `opener`, `Opener`, `companyShort`, `service`, `subject`, `personalization` (same line as opener), `city`, `suburb`, `email_status`, `outbound_status`, `is_archived`, `recontact_ok`, `suppression_reason`, `icp_status`, `eligibility_reason`. These status fields are local validation evidence and need not be mapped in Instantly. Instantly `email` is the opener CSV `verified_email` column. Blank any `first_name` that is a brand, slogan, city, or not a person, and rewrite that opener to start at `Saw`. Instantly CSV import keeps one row per email, so a duplicate address in the file is not a second lead.

`first_name` is a real person or blank. No `there`. No `{shop} team`. No brand as a name.

Before upload, say how many catch-all / risky rows are on the file. Instantly create has no `allow_risky_contacts`. Leave Verify leads off on the CSV dialog so catch-all rows stay. If those rows must send, Jules flips the campaign UI toggle.

## Done

For installation-booking, reserve the approved preparation only after the paused campaign passes readback, then download its generated CSV. Run the preparation reconciliation endpoint after upload; missing inboxes, extra inboxes and changed variables keep the load incomplete. The worker credentials cannot grant human approval.

For the historical file workflow, dump the `get_campaign` JSON to a file and run `python3 check_campaign.py <file> --timezone <City tz> --leads-csv <upload.csv>` from this skill folder. This checks every row and every email variant. Exit 0 proves settings and rendering only. After upload, read back the actual campaign lead email set, compare it to the CSV, and list every skipped address with its reason. Bind the Instantly campaign ID to the Compass cell and mark only confirmed uploaded lead IDs. Do not say loaded without that upload receipt. If it fails, fix the campaign and rerun. The batch scan below stays as the sound check on top of the gate.

Required:

- [ ] Draft, not live
- [ ] Each gap before the last email is 2+ days
- [ ] Timezone is that city
- [ ] Schedule is weekdays, unless Jules said weekend
- [ ] Email 1 starts with `{{personalization}}`, not a campaign `Hi {{firstName}},`
- [ ] `{{personalization}}` / `{{opener}}` and `{{subject}}` on email 1
- [ ] Bodies, subject, recipe and send settings match the approved current-offer preparation
- [ ] Every email body has `{{unsubscribe}}` as a visible Unsubscribe link
- [ ] `insert_unsubscribe_header` is true
- [ ] Campaign lead count equals the opener file, or skips are listed
- [ ] Campaign URL given, not live

Batch sound check (scan the opener file and the campaign, not a sample of 3):

- [ ] First names: real person or blank. None are `there`, `{shop} team`, a brand, slogan, or city
- [ ] Shop names in openers match the row
- [ ] Suburbs sit on the suburb, not a dummy city
- [ ] Trade noun is the shop (aircon, HVAC, heating and cooling). Not the appliance
- [ ] Unnamed openers start with Saw. Named openers may start Hi {name}, then Saw
- [ ] No invented email, suburb, time, or badge
- [ ] Catch-all count said out loud if any

Jules
