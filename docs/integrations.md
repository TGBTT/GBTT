# Integrations

## Production stack

- **Marketing site** (`src/`) — homepage, contact form, public timetable
- **Member & trainer apps** (`apps/`) — booking, admin, role-call, billing
- **Firestore** — system of record (see `firestore.rules`)
- **Firebase Auth** — members, admin, substitutes
- **Cloud Functions** (`functions/`) — account creation, billing, calendar webhooks
- **Apps Script** (`google-apps-script/Code.gs`) — email + Google Calendar on Tom's account

Configure secrets per [`docs/secrets-setup.md`](secrets-setup.md).

## Contact form

Posts to Apps Script when `VITE_FORM_ENDPOINT` is configured; otherwise mailto fallback.

## Google Calendar

Session roster changes trigger `calendarUpsertSession` via Cloud Functions → Apps Script.

## Local development without Firebase

Apps show a configuration banner when `VITE_FIREBASE_*` env vars are missing. Studio data uses browser `localStorage` until Firestore is connected.
