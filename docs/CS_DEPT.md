# Retention (cs-dept)

Monday client health. Drafts only. Jules reviews; nothing sends itself.

At 50 clients the job is 30 minutes: open at risk and day 25 cards, scan healthy as one line.

## Score (0 to 100)

Five factors, 20 points each, from the evidence spine plus voice, QBO, issues, and last touch:

| Factor | Signal |
| --- | --- |
| Call volume | This week vs last week |
| Booked / showed | Booked trend plus show rate (`booked` + past calendar slot) |
| Owner engaged | Days since `last_touch_at` |
| Payment | Deal status + unpaid invoice due dates |
| Support | Open / blocked issues + complaint titles |

Band: 75+ healthy, 55 to 74 watch, under 55 at risk. A 15 point drop also drafts a save play.

## Outputs

| Artifact | Who sees it |
| --- | --- |
| Weekly results | ROI tab (customer-safe: calls, booked, showed, recovered $) and Monday SMS / email drafts |
| Save play | Operator only. Call script with that client's numbers |
| Day 25 | Recovered contribution vs install fee ($1997). Short or covered, said before renewal |
| QBR | One pager when the account is 28+ days old and the last QBR is 28+ days ago |

Recovered $ uses `deal_terms.job_contribution_aud` or a trade default. That is an estimate until Jules sets the real contribution on the deal.

## Surfaces

- Operator: `/operations/cs`
- Per client: Clients aside → Retention
- Agent / automation: `GET|POST /api/agent/cs` (Bearer `COMPASS_AGENT_SECRET`)
- Operator run: `POST /api/cs`

Approve / skip: `PATCH /api/cs/artifacts/:id` `{ status: "approved"|"skipped", body? }`.

## Demo

Five seed accounts (`cs-demo-*`, tag `cs-demo`) cover healthy, at risk, day 25 pass, day 25 short, and overdue + support. The board loads them even before the migration is applied.

Migration: `0073_compass_cs_dept.sql` (`compass_cs_snapshots`, `compass_cs_artifacts`). Events append to `compass_evidence_events`.
