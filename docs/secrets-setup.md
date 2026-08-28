# GBTT secrets & infrastructure handoff

Complete this checklist before live Firebase integration testing. The app code and Cloud Functions are committed; they stay in a graceful “configuration required” state until these values exist.

## Status

Firebase project: **`gbtt-c1130`**

| Step | State |
|------|-------|
| Firestore database created | done |
| `firestore.rules` + indexes deployed | done |
| Rules hardened (billing, roster, signup gating, session deletes) | done — 32 tests in `firestore-tests/` |
| Web app registered (client config exists) | done |
| App reads timetable/attendance from Firestore | done — code committed, never yet run against live data |
| **Blaze plan + Cloud Functions deployed** | **todo — blocks everything below** |
| Timetable seeded into Firestore | **todo** — `functions/scripts/seed-timetable.mjs` |
| GitHub repository secrets | **todo** — run `scripts/sync-github-secrets.ps1` |
| Email/Password sign-in enabled | **todo** — console only |
| First admin custom claim | **todo** — `functions/scripts/set-admin-claim.mjs` |
| Apps Script deployed → `VITE_FORM_ENDPOINT` | **todo** |
| DNS for `gbtt.co.nz` → GitHub Pages | **todo** |
| App Check + API key referrer restriction | **todo** — hardening, not required to go live |

## Route to completion

The steps below are ordered because each unblocks the next. Everything before
step 1 is already done and committed.

**1. Upgrade to Blaze.** [Console → usage](https://console.firebase.google.com/project/gbtt-c1130/usage/details).
Cloud Functions cannot deploy on Spark: the CLI fails enabling
`artifactregistry.googleapis.com`. Set a budget alert at the same time. Nothing
else on this list can be finished first.

**2. Deploy the functions.** `firebase deploy --only functions`.

Until this lands the app is not merely incomplete, it is partly inoperative:
booking, roll call and session removal all call functions that do not exist
yet. Session removal in particular now fails closed — rules refuse client
deletes so that a session with attendance can never be hard-deleted, and the
`removeSession` callable that does it safely is not deployed. That is the safe
failure, but it is a failure.

**3. Seed the timetable.** `node functions/scripts/seed-timetable.mjs --key ./sa.json --weeks 8`
(`--dry-run` first). Firestore has no sessions yet, and the app deliberately
renders an empty week rather than inventing numbers, so the timetable stays
blank until this runs.

**4. Enable Email/Password sign-in** in the console, then **bootstrap the first
admin** with `functions/scripts/set-admin-claim.mjs`. The `role` claim cannot be
set from the console, and staff sign-in checks it, so the admin console is
unreachable until this is done.

**5. Set the GitHub secrets** with `scripts/sync-github-secrets.ps1`. Without
them the deployed site builds without Firebase config and falls back to local
seed data — which, given step 3's honest empty state, now means the live
timetable renders blank. This is the step most likely to look like a broken
site.

**6. Deploy Apps Script** and set `VITE_FORM_ENDPOINT` for contact email,
activation and calendar invites.

**7. Point DNS at GitHub Pages** for `gbtt.co.nz`.

### Known gaps after step 7

These are working software decisions still outstanding, not setup chores:

- **`calculateBillingPeriod` double-charges subscription members.** It adds a
  line item at `ratePerClass` for every attended session *and* the subscription
  base on top, so a `weekly2` member attending their included sessions for a
  month is billed roughly twice the plan price. Booking now records `dropIn`
  and `chargeRateCents` on each roster entry, which is the data a fix needs:
  charge the subscription base plus only the entries flagged `dropIn`. Until
  that lands, drop-ins are billed at the member's own plan rate rather than the
  intended casual rate, because the invoice still prices every attended session
  the same way. **Do not invoice from this until it is fixed.**
- **No recurring session generator.** `seed-timetable.mjs` creates a fixed
  number of weeks; someone must re-run it, or a scheduled function should
  generate each new week from `timetable/slots`.
- **The Firestore path has never run against live data.** It is typechecked,
  built and covered by rules tests, but every browser check to date exercised
  the local development fallback. The first real booking, roll call, weekly lock
  and archive are all worth watching directly.

### Security model

Members book through the `bookSession` / `cancelBooking` callables, never by writing Firestore
directly. Rules deny client roster writes, so capacity, membership status and the transfer window
are enforced in one place that cannot be bypassed from the browser console.

Self-registration creates a `pending` profile with no booking rights. An admin calls
`approveMember`, which sets `profile.status: active` and the `member` custom claim.

Members cannot write `billing`, `membership`, `clinical`, `profile.role` or `profile.status` on
their own document — those drive what they are charged and what they can reach.

Run the rules test suite after any change to `firestore.rules`:

```bash
cd firestore-tests && npm install && npm test
```

It needs Java for the emulator and pins its own `firebase-tools` because the current CLI requires
JDK 21.

Nothing below is destructive; steps can be re-run safely.

---

## 1. Firebase console (Tom’s Google account)

1. Create a Firebase project (Blaze plan required for Cloud Functions).
2. **Authentication** → Sign-in method → enable **Email/Password**.
3. **Firestore** → Create database → **production mode** (rules deploy from `firestore.rules` in this repo).
4. **Project settings** → Your apps → Add **Web app** → copy the client config:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `appId`
5. **Functions** → set default region to `australia-southeast1` (matches `functions/src/index.ts`).
6. Create the first **admin** user — see “Bootstrap the first admin” in section 6 below. This
   cannot be done from the console alone.
7. Recommended: set a **budget alert** on Blaze billing.

### Deploying the rules

`firestore.rules` and `firestore.indexes.json` in this repo are the source of truth. Editing rules
in the console works, but the next deploy overwrites it. Deploy with:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes
```

`.firebaserc` already pins the default project, so no `--project` flag is needed.

> **Realtime Database is not used.** This project is Cloud Firestore only — `firestore.rules` is
> written in the Firestore rules language and will not parse in the RTDB console. If an RTDB
> instance was created by accident, lock it down with
> `{"rules": {".read": false, ".write": false}}` so it is not left world-readable.

---

## 2. GitHub repository secrets

There are exactly **five**. Set them with the helper script rather than by hand — it reads the
Firebase values live from the project, so they cannot drift from what is deployed:

```powershell
gh auth login          # once
./scripts/sync-github-secrets.ps1
./scripts/sync-github-secrets.ps1 -FormEndpoint "https://script.google.com/macros/s/.../exec"
```

Or manually via Repo → Settings → Secrets and variables → Actions → **Repository secrets**:

| Secret | Value | Used by |
|--------|-------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase web `apiKey` | Marketing site + `apps/` build |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase `authDomain` | Same |
| `VITE_FIREBASE_PROJECT_ID` | Firebase `projectId` | Same |
| `VITE_FIREBASE_APP_ID` | Firebase `appId` | Same |
| `VITE_FORM_ENDPOINT` | Apps Script web app URL | Contact form, activation, Functions |

To read the current Firebase values at any time:

```bash
firebase apps:sdkconfig WEB --project gbtt-c1130
```

> `VITE_BASE` and `VITE_APP_BASE` are **not** secrets. They are hard-coded in
> `.github/workflows/pages.yml` (`/` and `/app/`) because they are deploy-layout constants, not
> configuration. Adding them as secrets has no effect.

Client Firebase keys are not secret in practice — they ship inside the JS bundle and are protected
by Security Rules, not by obscurity. They live in GitHub Secrets only to keep a single deploy path.

---

## 3. Local `.env` files (development)

Copy examples and fill values (never commit real secrets):

| File | Variables |
|------|-----------|
| `.env` | `VITE_FORM_ENDPOINT`, `VITE_ACTIVATION_KEY` (legacy until invite flow) |
| `apps/.env` | `VITE_FORM_ENDPOINT`, `VITE_ACTIVATION_KEY`, `VITE_APP_BASE=/app/`, all `VITE_FIREBASE_*` |
| `functions/.env` | `FORM_ENDPOINT`, `FUNCTIONS_WEBHOOK_SECRET` (emulator / local only) |

---

## 4. Apps Script (Tom deploys from repo)

1. Open the Google Sheet used for enquiries.
2. Extensions → Apps Script → paste / sync `google-apps-script/Code.gs` (comprehensive version when merged).
3. **Project settings → Script properties**:

| Property | Purpose |
|----------|---------|
| `NOTIFY_EMAIL` | Tom’s inbox for admin notifications |
| `CALENDAR_ID` | Shared studio Google Calendar ID |
| `FUNCTIONS_WEBHOOK_SECRET` | Must match Firebase `FUNCTIONS_WEBHOOK_SECRET` |
| `ACTIVATION_KEY` | Legacy signup key (retire after Firebase invite flow) |

4. Deploy → **New deployment** → Web app:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the deployment URL → `VITE_FORM_ENDPOINT` (GitHub Secret) and `FORM_ENDPOINT` (Functions).

### Apps Script actions used by Cloud Functions

| `action` | Trigger |
|----------|---------|
| `sendInvite` | `createMemberAccount` |
| `calendarUpsertSession` | `onRosterWrite` (roster subcollection changes) |
| `sendGuestPass` | `createGuestPass` |

Each Function → Script POST includes `webhookSecret` in the JSON body; Apps Script must reject unsigned calls.

---

## 5. Firebase Functions secrets & deploy

> **Requires the Blaze (pay-as-you-go) plan.** Cloud Functions cannot deploy on Spark, and
> `firebase functions:list` will fail with `Failed to list functions` until billing is enabled.
> Upgrade at Console → ⚙ → Usage and billing, and set a **budget alert** while you are there.

`FUNCTIONS_WEBHOOK_SECRET` is a value you invent — it is a shared password proving to Apps Script
that a request really came from your Cloud Functions. The *same* string must be set in two places:
Firebase (below) and Apps Script Script properties (section 4). Generate one with:

```powershell
# PowerShell
$b = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
([Convert]::ToBase64String($b) -replace '[+/=]','')
```

Then, from the repo root (after `npm ci` in `functions/`):

```bash
firebase login

# String param (Apps Script URL) — same value as VITE_FORM_ENDPOINT
firebase functions:params:set FORM_ENDPOINT "https://script.google.com/macros/s/.../exec"

# Secret (shared webhook key) — prompts for the value, paste the generated string
firebase functions:secrets:set FUNCTIONS_WEBHOOK_SECRET

# Deploy rules, indexes, and functions
firebase deploy --only firestore:rules,firestore:indexes,functions
```

Note both depend on the Apps Script web app existing first (section 4), so the usual order is:
deploy Apps Script → set `FORM_ENDPOINT` + `FUNCTIONS_WEBHOOK_SECRET` → deploy Functions.

Functions in this repo:

| Function | Type | Role |
|----------|------|------|
| `createMemberAccount` | Callable | Admin — Auth user + Firestore profile + invite |
| `adminResetPassword` | Callable | Admin — password reset link |
| `onRosterWrite` | Firestore trigger | Roster write → `calendarUpsertSession` |
| `calculateBillingPeriod` | Callable | Admin — billing period calculator |
| `createGuestPass` | Callable | Admin — guest pass + email |

---

## 6. Firestore deploy (rules + indexes)

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Security model (see `firestore.rules`):

- **Public read**: `catalog/*`, `timetable/slots`, `sessions` (summary), `siteContent`
- **Members**: own `users/{uid}` and subcollections
- **Staff**: `admin` or `substitute` custom claim on Auth token
- **Server-only**: `guestPasses` writes, `billingPeriods` writes, audit entries

### Bootstrap the first admin

The rules authorise staff from the **`role` custom claim** on the Auth token
(`request.auth.token.role`), not from any Firestore field. Adding `profile.role: admin` to a
`users/{uid}` document does **nothing** on its own, and custom claims cannot be set from the
Firebase console. So until this runs, every admin-only path denies for everyone — including Tom.

Bootstrap it once with the Admin SDK:

1. Authentication → Add user → Tom's email and a temporary password.
2. Project settings → **Service accounts** → Generate new private key. Save it **outside the repo**
   (for example `C:\keys\gbtt-sa.json`).
3. From the repo root:

   ```bash
   node functions/scripts/set-admin-claim.mjs --key C:\keys\gbtt-sa.json --email tom@example.com
   ```

   Useful variants:

   ```bash
   # inspect current claims without changing anything
   node functions/scripts/set-admin-claim.mjs --key <key> --email <addr> --show

   # promote a cover instructor
   node functions/scripts/set-admin-claim.mjs --key <key> --email <addr> --role substitute

   # create the Auth user at the same time
   node functions/scripts/set-admin-claim.mjs --key <key> --email <addr> --create --name "Tom"
   ```

4. **Delete the service-account key** once the claim is set. It is a full-project credential.

The claim is embedded in the ID token, so Tom must sign out and back in before admin screens
unlock (otherwise it takes up to an hour for the token to refresh).

After this, further staff can be managed in-app — `createMemberAccount` assigns the `member` claim
automatically.

---

## 7. Domain & GitHub Pages (`gbtt.co.nz`)

1. `public/CNAME` contains `gbtt.co.nz` (committed).
2. DNS at your registrar:

   | Type | Host | Value |
   |------|------|-------|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | CNAME | `www` | `agent5479.github.io` |

3. Repo Settings → Pages → Custom domain `gbtt.co.nz` → Save → tick **Enforce HTTPS** (after the certificate provisions, can take up to an hour).
4. Workflow already uses `VITE_BASE=/` and `VITE_APP_BASE=/app/` — correct for a custom apex domain.

> **Note:** because the build now uses `VITE_BASE=/`, the old project URL `agent5479.github.io/GBTT` will not load styles. Only `gbtt.co.nz` is supported from here on.

---

## 8. Smoke tests (after secrets are set)

### A. Apps Script (no Firebase)

```bash
curl -X POST "$VITE_FORM_ENDPOINT" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"enquiry","name":"Test","email":"you@example.com","message":"Smoke test","source":"handoff"}'
```

Expect `{ "ok": true }` and a row in the Submissions sheet.

### B. Calendar upsert (Script only)

```bash
curl -X POST "$FORM_ENDPOINT" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"calendarUpsertSession","webhookSecret":"YOUR_SECRET","sessionId":"smoke-1","session":{"weekStart":"2026-08-25","slotId":"mon-0700","rosterCount":3}}'
```

Expect a calendar event on the studio calendar.

### C. Client Firebase init

1. Build marketing site and apps with all `VITE_FIREBASE_*` set.
2. Open member app → no “configuration required” banner.
3. `isFirebaseConfigured()` returns true (`shared/studio/firebase/config.ts`).

### D. Admin auth

1. Sign in as admin (custom claim `role: admin`).
2. Callable `createMemberAccount` with `{ email, name, planId }` → new `users/{uid}` doc.
3. Member receives invite / reset email.

### E. Roster → Calendar

1. Admin or substitute updates `sessions/{id}/roster/{uid}` in Firestore (or via app when wired).
2. `onRosterWrite` fires → Apps Script `calendarUpsertSession` → calendar event updated.

### F. Billing calculator

1. Admin calls `calculateBillingPeriod` with `{ uid, periodStart: "2026-08-01" }`.
2. Check `users/{uid}/billingPeriods/{periodStart}` for `lineItems` and `totalCents`.

### G. Guest pass

1. Admin calls `createGuestPass` with `{ sessionId, guestName, guestEmail }`.
2. `guestPasses/{code}` document created; guest email sent via `sendGuestPass`.

---

## 9. Second-pass verification

When smoke tests pass:

- [ ] Member login and booking against live Firestore
- [ ] Substitute can role-call but not edit site content / billing settings
- [ ] GitHub Pages production deploy shows live timetable (public read)
- [ ] De-demo audit: no “simulated” copy in production paths

Execution is **code-complete** after this repo ships; **integration-complete** after this checklist is done and smoke tests pass.
