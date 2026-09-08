# Compass operator release — 8 September 2026

Scope: goals and notes, lightweight actual-time records, offer explanation and economics, visual experiment preparation, and trustworthy supervised operator inputs. Based on commercial release 469ea53 in an isolated release checkout; unrelated workspace work is excluded.

## User surfaces

- `/planning`: daily through yearly goals, regular/stretch thresholds, separate actuals and forecasts, evidence, parent goals, revision history, notes, actual/planned human effort, agent receipts and preparation queue.
- `/sales/offer-plan`: the current installation-booking contract, client and Switchflow benefits, three scope choices, separately scoped add-ons, scenario economics, diagnostic questions and reasons to decline or narrow the offer. Whimsical ideas are hypotheses, not approvals or proof.
- `/sales/experiments`: separate draft challengers, explicit changed dimension, planned sample and earliest review, link to existing copy editor, snapshot-backed preparation requests, selection of the specific challenger and manual outcome assessment gates. A queued request is not paid execution. Actual company-level assignment, running the existing mill and Instantly upload still require agent execution and destination verification; activation remains Jules-led.

## Reporting fixes

- Agent brief counts active pipeline campaigns rather than the first 12 records; cancelled rows do not appear in the working campaign list. Lead/campaign query failures no longer silently become zero.
- Waves excludes cancelled, archived and completed pipeline records from preparation lanes and reports unavailable Instantly data explicitly.
- Agent retention API no longer supplies demonstration clients as business facts.
- Interested leads and opportunities are not substituted for booked meetings.
- Opt-out status is preserved against later weaker Instantly sync classifications. Explicit unsubscribe marking disables recontact.
- Test-cell creation excludes retired offers and uses actual vertical tags rather than prose descriptions; it does not preselect five cities.

## Validation

Production build and type checks passed. Deploy guards passed. 56 focused tests passed. The broader run: 375 passed, 24 failed. Comparison with the unchanged commercial-release source reproduces the legacy failures (including missing surrounding workspace migrations/packs, existing timezone/UI expectations and older commercial-route boundary expectations); the full legacy suite is not green. No claim of whole-app certification.

Hosted preview: private agent workspace reads returned real project/task records; three unauthenticated route requests returned 401. An archived QA note was created, retried without duplication, edited with preserved history and rejected on a stale revision. Production destination and visual checks are recorded after release.

No new subscription, bank feed or Instantly activation is included. Unknown current MRR, bank details, client economics and unresolved commercial terms remain unknown. No automatic calendar surveillance or blended productivity score is introduced.
