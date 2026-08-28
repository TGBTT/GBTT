# GBTT Apps Script web endpoint

Comprehensive web app for GBTT email and Google Calendar integration. Handles contact enquiries, member activation (legacy), invites, admin broadcasts, billing notices, guest passes, and studio calendar sync.

Cloud Functions (Firebase) call protected actions with `webhookSecret` in the JSON body. Public marketing-site actions (`enquiry`, `activation`) do not require a secret.

**Note:** Apps Script web app deployments do not expose custom HTTP headers to `doPost`. Server-side callers must include `webhookSecret` in the JSON payload (matching script property `FUNCTIONS_WEBHOOK_SECRET`). The `X-GBTT-Webhook-Secret` header is documented for curl convenience but is not readable by the script runtime.

## Deploy

1. Create a Google Sheet (audit tabs are created automatically on first use).
2. Extensions → Apps Script → paste [`Code.gs`](Code.gs) → Save.
3. **Script properties** (Project settings → Script properties):

   | Property | Example | Purpose |
   |----------|---------|---------|
   | `NOTIFY_EMAIL` | `Tom.GBTT@gmail.com` | Tom's inbox for admin notifications |
   | `CALENDAR_ID` | `abc@group.calendar.google.com` | Shared studio Google Calendar ID |
   | `FUNCTIONS_WEBHOOK_SECRET` | long random string | Shared secret for Cloud Functions → Apps Script |
   | `ACTIVATION_KEY` | `GBTT-DEMO-ACTIVATE` | Legacy signup key (matches `VITE_ACTIVATION_KEY`) |

4. **Calendar setup** — create or share a Google Calendar with the Google account that deploys the script. Copy the calendar ID (Settings → Integrate calendar). Set `CALENDAR_ID` in script properties. Make the calendar public if members need ICS subscribe links.

5. Deploy → **New deployment** → Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**

6. Copy the deployment URL into site and apps env:

```bash
VITE_FORM_ENDPOINT=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
VITE_ACTIVATION_KEY=your-secret-key
```

7. After code changes, create a **New deployment** (or manage versions) — editing the script does not update an existing deployment URL automatically.

## Audit sheets

Each action logs a row to a dedicated tab:

| Sheet | Action |
|-------|--------|
| `Submissions` | `enquiry` |
| `Activations` | `activation` |
| `Invites` | `sendInvite` |
| `Broadcasts` | `sendSubscriberBroadcast` |
| `PlanChanges` | `sendPlanChangeNotice` |
| `Transfers` | `sendTransferNotice` |
| `PaymentReminders` | `sendPaymentReminder` |
| `GuestPasses` | `sendGuestPass` |
| `CalendarUpserts` | `calendarUpsertSession` |
| `CalendarDeletes` | `calendarDeleteSession` |
| `CalendarSubscribe` | `calendarGetSubscribeUrl` |
| `CalendarMemberSlots` | `calendarSyncMemberSlots` |
| `BookingInvites` | `sendBookingInvite`, `sendBookingCancellation` |

## Actions

| action | Auth | Channel | Purpose |
|--------|------|---------|---------|
| `enquiry` | Public | Email + Sheet | Contact form |
| `activation` | Public | Email + Sheet | Legacy signup key email |
| `sendInvite` | Webhook | Email + Sheet | New member set-password invite |
| `sendSubscriberBroadcast` | Webhook | Email + Sheet | Bulk email to recipients array |
| `sendPlanChangeNotice` | Webhook | Email + Sheet | Notify Tom of plan change request |
| `sendTransferNotice` | Webhook | Email + Sheet | Member reschedule confirmation |
| `sendPaymentReminder` | Webhook | Email + Sheet | Billing reminder to member |
| `sendGuestPass` | Webhook | Email + Sheet | Complimentary session code |
| `sendBookingInvite` | Webhook | Email + Sheet | ICS `METHOD:REQUEST` to one member on booking |
| `sendBookingCancellation` | Webhook | Email + Sheet | ICS `METHOD:CANCEL` to one member on cancel |
| `calendarUpsertSession` | Webhook | Calendar + Sheet | Create/update session event |
| `calendarDeleteSession` | Webhook | Calendar + Sheet | Delete session event |
| `calendarGetSubscribeUrl` | Webhook | Sheet | Return public calendar / ICS URLs |
| `calendarSyncMemberSlots` | Webhook | Calendar + Sheet | Update member slot metadata in event description |

All POST bodies use `Content-Type: text/plain;charset=utf-8` (same as the marketing contact form).

Set shell variables for curl tests:

```bash
export ENDPOINT="https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
export SECRET="your-functions-webhook-secret"
```

### enquiry (public)

```bash
curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"enquiry","name":"Jane Doe","email":"jane@example.com","phone":"021 000 0000","message":"Interested in Strong class","source":"website"}'
```

### activation (public)

```bash
curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"activation","name":"Alex Member","email":"alex@example.com","planId":"weekly2","source":"member-booking"}'
```

### sendInvite

```bash
curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -H "X-GBTT-Webhook-Secret: $SECRET" \
  -d "{\"action\":\"sendInvite\",\"webhookSecret\":\"$SECRET\",\"name\":\"Alex Member\",\"email\":\"alex@example.com\",\"planName\":\"2 classes / week\",\"inviteLink\":\"https://gbtt.co.nz/app/fitness/studioflow/#set-password\"}"
```

### sendSubscriberBroadcast

Send to Tom only (`testMode: true`) before a live broadcast:

```bash
curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d "{\"action\":\"sendSubscriberBroadcast\",\"webhookSecret\":\"$SECRET\",\"subject\":\"GBTT timetable update\",\"body\":\"Strong moves to 17:30 this Thursday.\",\"recipients\":[\"member1@example.com\",\"member2@example.com\"],\"testMode\":true}"
```

Live broadcast (remove `testMode` or set `false`):

```bash
curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d "{\"action\":\"sendSubscriberBroadcast\",\"webhookSecret\":\"$SECRET\",\"subject\":\"GBTT timetable update\",\"body\":\"See you at Rec Park!\",\"recipients\":[\"member1@example.com\",\"member2@example.com\"]}"
```

### sendPlanChangeNotice

```bash
curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d "{\"action\":\"sendPlanChangeNotice\",\"webhookSecret\":\"$SECRET\",\"memberName\":\"Alex Member\",\"memberEmail\":\"alex@example.com\",\"currentPlan\":\"1 class / week\",\"requestedPlan\":\"2 classes / week\",\"notes\":\"Requested via member portal\"}"
```

### sendTransferNotice

```bash
curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d "{\"action\":\"sendTransferNotice\",\"webhookSecret\":\"$SECRET\",\"memberName\":\"Alex Member\",\"memberEmail\":\"alex@example.com\",\"fromSession\":\"Mon 06:00 Strong\",\"toSession\":\"Wed 17:15 Strong\",\"notes\":\"Within weekly allowance\"}"
```

### sendPaymentReminder

```bash
curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d "{\"action\":\"sendPaymentReminder\",\"webhookSecret\":\"$SECRET\",\"memberName\":\"Alex Member\",\"memberEmail\":\"alex@example.com\",\"amountDue\":\"\$60.00\",\"dueDate\":\"2026-09-01\",\"balanceNote\":\"2 weeks outstanding\",\"paymentInstructions\":\"Bank transfer to GBTT account — ask Tom for details\"}"
```

### sendGuestPass

```bash
curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d "{\"action\":\"sendGuestPass\",\"webhookSecret\":\"$SECRET\",\"guestName\":\"Sam Friend\",\"guestEmail\":\"sam@example.com\",\"passCode\":\"GUEST-2026-001\",\"sessionLabel\":\"Thu 06:00 Sweat\",\"expiresAt\":\"2026-09-05\",\"notes\":\"Holiday cover for Alex\"}"
```

### calendarUpsertSession

Creates or updates a calendar event. Title format: `{className} · {fill} · GBTT`.

```bash
curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d "{\"action\":\"calendarUpsertSession\",\"webhookSecret\":\"$SECRET\",\"sessionId\":\"sess-mon-strong-2026-09-01\",\"calendarEventId\":\"\",\"weekStart\":\"2026-09-01\",\"dayLabel\":\"Mon\",\"time\":\"17:15\",\"className\":\"Strong\",\"instructor\":\"Tom\",\"venue\":\"Rec Park Centre, Tākaka\",\"cap\":18,\"bookedCount\":12,\"durationMinutes\":60,\"roster\":[{\"displayName\":\"Alex M.\",\"kind\":\"member\"},{\"displayName\":\"Ben T.\",\"kind\":\"guest\"}]}"
```

Response includes `calendarEventId` and `htmlLink` — store `calendarEventId` on the Firestore session document for later updates/deletes.

### calendarDeleteSession

By `calendarEventId`:

```bash
curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d "{\"action\":\"calendarDeleteSession\",\"webhookSecret\":\"$SECRET\",\"calendarEventId\":\"YOUR_EVENT_ID\"}"
```

Or by `sessionId` (searches event description within the week):

```bash
curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d "{\"action\":\"calendarDeleteSession\",\"webhookSecret\":\"$SECRET\",\"sessionId\":\"sess-mon-strong-2026-09-01\",\"weekStart\":\"2026-09-01\"}"
```

### calendarGetSubscribeUrl

```bash
curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d "{\"action\":\"calendarGetSubscribeUrl\",\"webhookSecret\":\"$SECRET\"}"
```

Returns `calendarId`, `publicUrl`, `icsUrl`, and `htmlLink`.

### calendarSyncMemberSlots

Updates the `Member weekly slots:` block in an event description:

```bash
curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d "{\"action\":\"calendarSyncMemberSlots\",\"webhookSecret\":\"$SECRET\",\"sessionId\":\"sess-mon-strong-2026-09-01\",\"weekStart\":\"2026-09-01\",\"memberSlots\":[{\"memberName\":\"Alex Member\",\"dayLabel\":\"Mon\",\"time\":\"17:15\",\"slotLabel\":\"Strong\"},{\"memberName\":\"Cara M.\",\"dayLabel\":\"Wed\",\"time\":\"17:15\",\"slotLabel\":\"Strong\"}]}"
```

## Smoke tests (no Firebase)

1. Deploy web app with all script properties set.
2. POST `enquiry` from curl or the marketing contact form → row in `Submissions`, email to `NOTIFY_EMAIL`.
3. POST `calendarUpsertSession` with sample JSON → event appears in Google Calendar.
4. POST `sendSubscriberBroadcast` with `testMode: true` → email to Tom only.
5. POST `calendarGetSubscribeUrl` → valid ICS URL in response.
6. POST `calendarDeleteSession` → event removed.

## Site integration

Until the endpoint is configured, the contact form falls back to `mailto:` and member signup shows the demo activation key in the UI.

```bash
# .env
VITE_FORM_ENDPOINT=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
VITE_ACTIVATION_KEY=your-secret-key
```

Firebase Cloud Functions use the same `VITE_FORM_ENDPOINT` URL pattern with `webhookSecret` in the JSON body for protected actions.
