# Calendar connection setup

Configure a Google Cloud web OAuth client with Calendar API and Gmail API enabled. Set `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET` securely in the hosting environment. Do not put secrets in source control. Register the exact callback `https://compass-web-eosin.vercel.app/api/day-planner/callback` (and the exact corresponding origin for any separately tested deployment).

Requested scopes: calendar.events, calendar.calendarlist.readonly and gmail.readonly. Add the intended Google account as a test user if the consent app is in testing. Google may impose consent verification and testing-token limits. The integration never sends email. Read the official [Gmail scopes guidance](https://developers.google.com/workspace/gmail/api/auth/scopes) when configuring the consent screen.

After deployment, open Calendar settings and connect Google. Verify listing calendars, selecting a writable calendar, reading events, importing a labelled test email, explicitly publishing a temporary time block, updating it, and detecting an external ETag conflict. Check reload persistence and confirm no duplicate events after retry. These live checks are outstanding.

Planner data is stored separately in `compass_settings` as `workspace.day-planner.v1`; OAuth refresh credentials use `integrations.planner_google.refresh_token`. Both use existing secret encryption. Canonical tasks are managed through the existing task API. No database migration was introduced.

## Configuration completed 14 September 2026

Created the separate Compass Calendar web client in project `drive-mcp-switchflow`, with the callback above. Its client ID and secret are configured in Vercel production. Calendar/Gmail API enablement and account consent remain pending; credentials alone do not establish a working connection.
