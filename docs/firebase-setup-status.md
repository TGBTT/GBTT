# Firebase setup status — verified 2026-08-31

Point-in-time audit of the live `gbtt-c1130` project, captured from the Firebase
CLI (v15.28.2, signed in as `tom.gbtt@gmail.com`). Everything below was observed,
not inferred; anything that could not be checked from the CLI is marked as such.

`docs/secrets-setup.md` remains the handbook. This file is only the record of
what is actually true in the project right now.

## Project

| Item | Value |
|------|-------|
| Project display name | GBTT |
| Project ID | `gbtt-c1130` |
| Project number | `345399237202` |
| Billing plan | **Spark (free)** — confirmed by a failed functions deploy |
| Resource location | Not specified |

## Registered apps

One web app, no others:

| Display name | App ID | Platform |
|--------------|--------|----------|
| GBTT Web | `1:345399237202:web:e2778e38738f26610b9d8b` | WEB |

## Live web app config

From `firebase apps:sdkconfig WEB --project gbtt-c1130`:

```json
{
  "projectId": "gbtt-c1130",
  "appId": "1:345399237202:web:e2778e38738f26610b9d8b",
  "databaseURL": "https://gbtt-c1130-default-rtdb.firebaseio.com",
  "storageBucket": "gbtt-c1130.firebasestorage.app",
  "apiKey": "AIzaSyBspWMtgDEzUeXFukxeoXKkT0uF7GKj1Do",
  "authDomain": "gbtt-c1130.firebaseapp.com",
  "messagingSenderId": "345399237202",
  "measurementId": "G-SML9BQBYD4"
}
```

A `databaseURL` is present, which means a Realtime Database instance exists.
This project uses Cloud Firestore only, so that instance is unused. Whether its
rules are locked down could not be checked from the CLI — `firestore.rules` does
not apply to it. Worth confirming in the console.

## Firestore — deployed

`firebase deploy --only firestore --project gbtt-c1130` succeeded:

```
+  cloud.firestore: rules file firestore.rules compiled successfully
+  firestore: deployed indexes in firestore.indexes.json successfully for (default) database
+  firestore: released rules firestore.rules to cloud.firestore
+  Deploy complete!
```

This was the first deploy carrying the pending rules work, so the following
`match` blocks are now live: `seasons`, `pricingPlans`, `pricingDiscounts`,
`classTypes`, `timetableSlots`.

The `roster.memberId` field override is also live now. It was genuinely missing
before — `firestore:indexes` returned `"fieldOverrides": []` prior to the deploy
and returns this afterwards:

```json
{
  "collectionGroup": "roster",
  "fieldPath": "memberId",
  "ttl": false,
  "indexes": [
    { "order": "ASCENDING", "queryScope": "COLLECTION" },
    { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" }
  ]
}
```

Six composite indexes are deployed and match `firestore.indexes.json`:
`billingPeriods(status, periodStart)`, `bookings(sessionId, status)`,
`roster(status, bookedAt)`, `sessions(slotId, weekStart)`,
`sessions(weekStart, instructorId)`, `sessions(weekStart, slotId)`.

## Cloud Functions — blocked

`firebase functions:list` reports `No functions found in project gbtt-c1130.`
Nothing is deployed. The TypeScript build (`tsc`) ran clean, so the code is
deployable; only billing blocks it. Exact deploy failure:

```
Error: Your project gbtt-c1130 must be on the Blaze (pay-as-you-go) plan to
complete this command. Required API cloudbuild.googleapis.com can't be enabled
until the upgrade is complete. To upgrade, visit the following URL:

https://console.firebase.google.com/project/gbtt-c1130/usage/details
```

Seventeen exported functions in `functions/src/index.ts` are waiting on this:
`createMemberAccount`, `adminResetPassword`, `approveMember`, `onRosterWrite`,
`onSessionWrite`, `bookSession`, `cancelBooking`, `markAttendance`,
`addMemberToSession`, `lockWeeklySlot`, `unlockWeeklySlot`, `removeSession`,
`calculateBillingPeriod`, `markBillingPeriodPaid`, `generateSeasonSessions`,
`projectSeasonInvoice`, `createGuestPass`.

## Authentication

`firebase auth:export` returned `{"users": []}` — **zero accounts exist**. So no
admin has been bootstrapped and no member has ever signed up.

Whether the Email/Password sign-in provider is enabled **cannot be determined or
changed from the CLI**. `firebase auth` exposes only `auth:export` and
`auth:import`; there is no provider-configuration command. This must be done in
the console:

<https://console.firebase.google.com/project/gbtt-c1130/authentication/providers>

Click path: Authentication → Sign-in method → Email/Password → Enable → Save.
Leave "Email link (passwordless sign-in)" off; the code uses password sign-in
plus email verification.

## `VITE_ACTIVATION_KEY` is no longer required

Verified by repo-wide search. There is no runtime read of it anywhere — no
`import.meta.env.VITE_ACTIVATION_KEY` and no `activationKeyValid` call. What
remains is inert:

- `apps/src/vite-env.d.ts` — an optional type declaration only
- `shared/studio/accountApi.ts` — a comment explaining why it was removed
- `.env.example`, `apps/.env.example` — stale example lines
- `google-apps-script/Code.gs` — a server-side `ACTIVATION_KEY` script property,
  still read by the Apps Script `activate` path; unused now that no client sends it

Do not set it as a GitHub secret or in any `.env`. The two `.env.example` files
and the `docs/secrets-setup.md` local-env table still list it and are out of date.

## Required configuration values

Four of the five GitHub secrets are knowable today (read live from the project);
the fifth depends on the Apps Script deployment.

| Name | Scope | Value |
|------|-------|-------|
| `VITE_FIREBASE_API_KEY` | GitHub secret + `apps/.env` + `.env` | `AIzaSyBspWMtgDEzUeXFukxeoXKkT0uF7GKj1Do` |
| `VITE_FIREBASE_AUTH_DOMAIN` | GitHub secret + `apps/.env` + `.env` | `gbtt-c1130.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | GitHub secret + `apps/.env` + `.env` | `gbtt-c1130` |
| `VITE_FIREBASE_APP_ID` | GitHub secret + `apps/.env` + `.env` | `1:345399237202:web:e2778e38738f26610b9d8b` |
| `VITE_FORM_ENDPOINT` | GitHub secret + `apps/.env` + `.env` | Apps Script web app `/exec` URL — obtain by deploying `google-apps-script/Code.gs` |
| `VITE_APP_BASE` | `apps/.env` only (workflow hard-codes it) | `/app/` |
| `FORM_ENDPOINT` | Functions param + `functions/.env` | Same URL as `VITE_FORM_ENDPOINT` |
| `FUNCTIONS_WEBHOOK_SECRET` | Functions secret + Apps Script property + `functions/.env` | Generate yourself; must match in all three places |

`VITE_BASE` is not a secret — `.github/workflows/pages.yml` hard-codes `/`.

The four `VITE_FIREBASE_*` values are the only ones the build actually validates:
`shared/studio/firebase/config.ts` returns `null` from `getFirebaseConfig()`
unless all four are non-empty, which is what triggers the "configuration
required" fallback in the deployed app.
