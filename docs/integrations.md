# Integrations

## Now (simulated)

- **Studio Flow / Class Board** use in-memory demo state with sync chips labeled Google Calendar and Firebase. Nothing is written to a live project.
- **Contact form** posts to Apps Script when `VITE_FORM_ENDPOINT` is configured; otherwise mailto fallback.

## Deferred — Firebase

Tom will likely use Firebase for private clients and group/family records. The data tree (individuals vs households vs packs vs venues) is **not fixed yet**. Do not invent a production schema until that workshop happens.

Suggested future keys (illustrative only):

- `venues/{venueId}` — aligned with `src/data/locations.ts`
- `members/{memberId}` — packs, credits, waivers
- `groups/{groupId}` — kids/teens or family units
- `occurrences/{id}` — class instances with `venueId` + roster

## Deferred — Google Calendar

Live class events and holds will go through Apps Script (or a Cloud Function) once `CALENDAR_ID` exists. Demo apps already show the UX for cap-limited bookings and sync acknowledgements.
