# Codex GHL Integration

TypeScript helpers and example Next.js API routes for calling the HighLevel / GoHighLevel API from one isolated integration layer.

## What This App Uses

The integration lives in `lib/ghl` and reads credentials from environment variables only:

```bash
GHL_API_KEY=
GHL_LOCATION_ID=
GHL_API_BASE_URL=https://services.leadconnectorhq.com
GHL_API_VERSION=2021-07-28
```

Do not commit real tokens to this repo. Keep them in `.env.local` locally and in Vercel project environment variables for deploys.

## Get A GHL Private Integration Token

HighLevel calls these Private Integration Tokens, or PITs. They are static/fixed OAuth-style tokens created in the HighLevel UI, and HighLevel recommends rotating them regularly.

1. Log in to HighLevel as an agency admin, or as a user with Private Integrations permission.
2. Go to **Agency Settings**.
3. Open **Private Integrations**.
4. Click **Create new Integration**.
5. Add a clear name and description, for example `Codex GHL Integration - Production`.
6. Select only the scopes this app needs.
7. Create the integration and copy the generated token immediately. HighLevel does not show the same token again later.

If you do not see **Private Integrations**, HighLevel says to confirm the feature is enabled in Labs and that your user has the right role permissions.

Official references:

- [Private Integrations: Everything you need to know](https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know)
- [HighLevel API documentation](https://marketplace.gohighlevel.com/docs/)

## Required Scopes

Use least privilege. The exact labels can change in the HighLevel UI, but for the helpers in this repo, enable the read/write scopes for these areas:

| Helper | Scope area to enable |
| --- | --- |
| `createContact` | Contacts write |
| `updateContact` | Contacts write |
| `searchContactByEmailOrPhone` | Contacts read |
| `listPipelines` | Opportunities/Pipelines read |
| `listOpportunities` | Opportunities read |
| `listConversations` | Conversations/Messages read |
| `listCalendars` | Calendars read |
| `getMissionControlSnapshot` | Opportunities/Pipelines read, Conversations/Messages read, Calendars read |
| `createOpportunity` | Opportunities write, plus pipeline/stage access if listed separately |
| `addContactNote` | Contacts write or Contact Notes write |
| `sendSmsOrConversationMessage` | Conversations/Messages write |
| `createCalendarAppointment` | Calendars/Appointments write |
| `triggerInboundWebhook` | No GHL token scope if posting to a workflow inbound webhook URL; protect that webhook URL like a secret |

If you split read and write tokens later, use a read-only token for search/test routes and a separate write token for mutating routes.

## Get The Location ID

`GHL_LOCATION_ID` is the default sub-account/location ID this integration should operate on.
`GHL_DOCTOR_DAMP_LOCATION_ID` is optional and lets the Doctor Damp lead-summary panel query that sub-account specifically without changing the rest of the dashboard.

Common places to find it:

1. Open the target sub-account in HighLevel.
2. Go to **Settings**.
3. Look for **Business Profile**, **Company Settings**, or the URL/query string for the selected location.
4. Copy the location/sub-account ID and use it as `GHL_LOCATION_ID`.

The app sends this location ID in request bodies or query strings for location-scoped endpoints.

## Local Setup

Create `.env.local` in the project root:

```bash
GHL_API_KEY=your_private_integration_token
GHL_LOCATION_ID=your_location_id
GHL_DOCTOR_DAMP_LOCATION_ID=PkoELbKfvhIzmaYMsV4r
GHL_API_BASE_URL=https://services.leadconnectorhq.com
GHL_API_VERSION=2021-07-28
```

Install dependencies and run locally:

```bash
npm install
npm run dev -- -H 127.0.0.1
```

The API routes will be available at:

```text
http://127.0.0.1:3000/api/ghl/create-contact
http://127.0.0.1:3000/api/ghl/update-contact
http://127.0.0.1:3000/api/ghl/search-contact
http://127.0.0.1:3000/api/ghl/list-pipelines
http://127.0.0.1:3000/api/ghl/list-opportunities
http://127.0.0.1:3000/api/ghl/list-conversations
http://127.0.0.1:3000/api/ghl/list-calendars
http://127.0.0.1:3000/api/ghl/mission-control
http://127.0.0.1:3000/api/ghl/ai-agent-effectiveness
http://127.0.0.1:3000/api/ghl/lead-summary
http://127.0.0.1:3000/api/ghl/create-opportunity
http://127.0.0.1:3000/api/ghl/add-contact-note
http://127.0.0.1:3000/api/ghl/send-message
http://127.0.0.1:3000/api/ghl/create-calendar-appointment
http://127.0.0.1:3000/api/ghl/trigger-inbound-webhook
```

## Vercel Setup

In the Vercel dashboard:

1. Open the project.
2. Go to **Settings** > **Environment Variables**.
3. Add:
   - `GHL_API_KEY`
   - `GHL_LOCATION_ID`
   - `GHL_API_BASE_URL`
   - `GHL_API_VERSION`
4. Set `GHL_API_BASE_URL` to `https://services.leadconnectorhq.com`.
5. Set `GHL_API_VERSION` to `2021-07-28`.
6. Choose the environments that should receive the values: Production, Preview, and/or Development.
7. Redeploy after adding or changing environment variables.

You can also add them with the Vercel CLI:

```bash
vercel env add GHL_API_KEY production
vercel env add GHL_LOCATION_ID production
vercel env add GHL_API_BASE_URL production
vercel env add GHL_API_VERSION production
```

Repeat for `preview` and `development` if needed.

## Test Example

Search for a contact by email:

```bash
curl "http://127.0.0.1:3000/api/ghl/search-contact?email=test@example.com"
```

Load the mission-control snapshot:

```bash
curl "http://127.0.0.1:3000/api/ghl/mission-control"
```

Load the RT Digital AI Agent Effectiveness MVP snapshot:

```bash
curl "http://127.0.0.1:3000/api/ghl/ai-agent-effectiveness"
```

This MVP analyzes recent GHL conversations and message history for the configured
sub-account. It uses heuristic scoring over message direction, automation markers,
conversation tags, text sentiment, booking signals, objections, and call-message
metadata. Call transcript scoring can be added by extending the same layer with
HighLevel's message transcription endpoint.

Load the DrDamn lead summary MVP snapshot:

```bash
curl "http://127.0.0.1:3000/api/ghl/lead-summary"
```

This route pages through the latest contacts for the configured sub-account,
summarizes contact details, tags, source, available address/location fields,
custom-field highlights, and recent conversation previews. The first MVP keeps
the dashboard bounded for performance and reports the total contact count from
HighLevel.

## Python Audit Tools

There is also a small read-only Python toolkit in `scripts/ghl` for deeper
audits, workflow endpoint probing, and future AI-agent diagnostics. It uses the
same `.env.local` values as the app and redacts tokens in command output.

```bash
python3 scripts/ghl/ghl_audit.py accounts
python3 scripts/ghl/ghl_audit.py audit --account doctor-damp
python3 scripts/ghl/ghl_audit.py workflows --account doctor-damp
```

Reports are written to `reports/ghl/`, which is ignored by git. If every audit
check returns `403`, the token is valid enough to load locally but does not have
the required HighLevel scopes for those read endpoints.

Create a contact:

```bash
curl --request POST "http://127.0.0.1:3000/api/ghl/create-contact" \
  --header "Content-Type: application/json" \
  --data '{
    "firstName": "Test",
    "lastName": "Contact",
    "email": "test@example.com",
    "phone": "+15555550123",
    "source": "Codex local test"
  }'
```

## Security Notes

- Paste only the raw PIT value into `GHL_API_KEY`; the client adds the authorization header.
- Do not put `GHL_API_KEY` in client-side code.
- Rotate the token if it is exposed.
- Keep inbound webhook URLs out of logs and screenshots.
- Use separate tokens for local/dev/prod when possible.
- Prefer a location-level token for this app when it only needs one sub-account.
