# Integrations

## Now (simulated)

- **Studio Flow / Class Board** persist to browser `localStorage` (`gbtt-sim-v1`) as a stand-in for Firebase Auth + client/group records and Google Calendar writes.
- Demo accounts (password `demo`): `alex@demo` (member), `tom@gbtt` (admin), `cover@gbtt` (substitute).
- Admin can reset seed data from the console. Sync chips still label Calendar / Firebase as simulated.
- **Contact form** posts to Apps Script when `VITE_FORM_ENDPOINT` is configured; otherwise mailto fallback.

## Deferred — Firebase

Tom will likely use Firebase for private clients and group/family records. The data tree (individuals vs households vs packs vs venues) is **not fixed yet**. Do not invent a production schema until that workshop happens.

Suggested future keys (illustrative only):

- `venues/{venueId}` — aligned with `src/data/locations.ts`
- `members/{memberId}` — packs, weekly allowance, waivers, name privacy
- `groups/{groupId}` — kids/teens or family units
- `occurrences/{id}` — class instances with `venueId` + roster
- `siteContent` — public blurbs currently edited in the admin Site content tab

## Deferred — Google Calendar

Live class events and holds will go through Apps Script (or a Cloud Function) once `CALENDAR_ID` exists. Demo apps already show fill bars, caps, and sync acknowledgements.
