# Route to completion

Written 31 Aug 2026, after the Apps Script audit-logging fix. Ordered so that
the things that are currently wrong in production come first and the crawler
and metadata work comes last, as agreed.

Status of the wider migration: sessions, rosters, attendance, pricing, seasons,
members, payments, plan changes, reminders and member preferences all read and
write Firestore. What remains below is the tail.

---

## 0. Two live breakages needing Tom, not code

Both are configuration, and no amount of code lands them.

**`VITE_FORM_ENDPOINT` goes stale on every redeploy.** Each Apps Script
redeploy mints a new deployment id, so the `/exec` URL changes. Cloud Functions
read theirs from the `FORM_ENDPOINT` param, but the marketing contact form
calls Apps Script straight from the browser using this GitHub secret, so it has
to be reset and the Pages workflow re-run, or the public contact form posts to
a retired deployment. The current URL lives in the `FORM_ENDPOINT` secret, not
here — writing it into this file is what let it drift last time.

**`CALENDAR_ID` has never been set.** Verified against the live endpoint:

```
{"ok": false, "error": "CALENDAR_ID script property not configured"}
```

Every shared-calendar action fails on this, so `calendarUpsertSession`,
`calendarDeleteSession` and the subscribe URL do nothing. The value Tom
supplied is
`d33869728efbe6bcbb6639433e96141db8a89b6919e1f4b7169f9c2cbbd93912@group.calendar.google.com`.
Setting it also requires authorising the Calendar scope on first run.

Per-member booking invites are unaffected — those are ICS attachments over
email and are working.

---

## 1. Class types and exercises to Firestore

The largest remaining case of the bug class fixed on 31 Aug: an admin edit that
looks saved but only reaches `localStorage`.

In [apps/src/pages/fitness/ClassBoard.tsx](apps/src/pages/fitness/ClassBoard.tsx)
these all write to the seed store: `renameExercise` (183), `updateClassType`
(685, 695, 706, 718, 730, 742, 754 — name, blurb, long description, warnings,
restrictions, recommendations, what to bring), `setClassCap` (770),
`toggleExercise` (788, 885), `deleteExercise` (858), `addExercise` (883),
`createClassType` (914), `archiveClassType` (927).

Reads to move with them: `getClassTypes` (162, 188), `classTypeById` (230, 294,
303, 601, 1034), `getExercises` (285), and
[shared/studio/ClassTypeAccordion.tsx](shared/studio/ClassTypeAccordion.tsx):23.

Work: a `liveClassTypes.ts` layer over the existing `classTypes` collection
(rules already exist), an `exercises` collection, a `useLiveClassTypes` hook,
and rewiring the above. Class descriptions are member-facing, so this also
stops members reading seeded copy.

## 2. Site content to Firestore

`getSiteContent` (ClassBoard 290, StudioFlow 70) and `updateSiteContent`
(ClassBoard 1153, 1164, 1175, 1370, 1381, 1391) cover payment instructions,
terms, waiver, hero blurb, schedule narrative and contact details.

This matters beyond display: the terms and waiver text is what members accept,
and acceptance is now recorded server-side, so the text needs to live somewhere
auditable rather than in one browser.

Work: a `siteContent/current` document, admin-write rules, a live layer, and
rewiring both readers plus the six editors.

## 3. Settings

`getTransferWindowHours` / `setTransferWindowHours` (ClassBoard 1110, 1112) and
`getEquipmentChecked` / `setEquipmentChecked` (1292, 949).

The transfer window is the sharp one: the Cloud Functions already enforce their
own `DEFAULT_TRANSFER_WINDOW_HOURS`, so the admin control currently edits a
number the server never reads. Either move it to a settings document the
functions read, or remove the control. Recommend the former.

## 4. Make the subscriber broadcast real

`sendSubscriberEmail` (ClassBoard 1198) appends a message to a fake outbox and
sends nothing, while `getOutbox` (291) renders that fake history. Apps Script
already implements `sendSubscriberBroadcast` with a `testMode` flag.

Work: a `sendBroadcast` callable that pulls member emails server-side and calls
the existing action, then replace the outbox panel with real send results.
Worth doing early — an admin can currently believe they have emailed everyone.

## 5. Public marketing timetable

[src/components/ClassSchedule.tsx](src/components/ClassSchedule.tsx) lines
18–24 render the public weekly timetable from the seed store via `reloadStore`,
`occurrencesByWeekday` and `getClassTypes`. Visitors are shown an invented
schedule with invented fill counts.

Work: read the current week from Firestore. Note this is the marketing site,
which has no authenticated user, so it needs either public read on `sessions`
or a small published-timetable document. The latter is safer and cheaper.

## 6. Retire the seed store

Once 1–5 land, the only remaining users are session identity
(`getSessionUser`, `getSessionRole`, `subscribeStore`) across ClassBoard,
StudioFlow, [apps/src/components/SiteNav.tsx](apps/src/components/SiteNav.tsx)
and [apps/src/pages/fitness/SignIn.tsx](apps/src/pages/fitness/SignIn.tsx),
kept alive by `bindMemberSession` / `bindStaffSession` in
[shared/studio/studioAuth.ts](shared/studio/studioAuth.ts):13.

Also `syncLabels` (ClassBoard 293, StudioFlow 78), which renders a
"Firestore · …" banner from `localStorage` write timestamps. It reports the
wrong thing today and should go.

Work: replace the mirrored session with Firebase auth state plus the live
profile, then delete `fitnessStudio.ts`'s store, `STORAGE_KEY` and the
`SimUser` type. This is the point at which the app can no longer show invented
data.

## 7. Local and cosmetic tidy

`sim-demos/`, the service account key
`gbtt-c1130-firebase-adminsdk-fbsvc-002789d94b.json`, `.tmp-auth-probe` and the
root `dist/` are all untracked working-directory clutter. The key is matched by
`.gitignore` line 17 and appears nowhere in git history, so nothing leaked;
delete it once the admin scripts are no longer needed.

`apps/src/styles/app.css` still names keyframes `demo-fade-up`, `demo-pop`,
`demo-tile-in` and similar. Internal identifiers only.

## 8. Crawler files and metadata — final task

Nothing here exists yet and the Pages workflow references none of it.

- `robots.txt` with a sitemap pointer.
- `sitemap.xml` covering the marketing routes. The app routes under `/app/`
  are behind sign-in and should be excluded.
- `llms.txt` describing the business for language models.
- `og:image` in [index.html](index.html):25 is a relative path, which most
  crawlers will not resolve. Needs the absolute `https://gbtt.co.nz/og-image.png`.
- No canonical link, and `twitter:title` / `twitter:description` are missing
  while `twitter:card` is present.
- No JSON-LD. A `LocalBusiness` or `SportsActivityLocation` block with address,
  geo and opening hours is the single highest-value addition for a business
  people search for locally.

One decision to make when we get here: the marketing site is client-rendered,
so crawlers that do not execute JavaScript see an empty shell. Static metadata
in `index.html` covers the home page, but per-page titles and descriptions for
class pages would need prerendering. Worth deciding whether that is in scope.

---

## Suggested order

0 first because it is broken in production right now and costs minutes. Then
4, 1, 2 (the ones where someone can act on false information), then 3, 5, 6,
7, and 8 last as agreed.
