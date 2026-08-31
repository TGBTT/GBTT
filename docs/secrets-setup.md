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
| Google sign-in enabled | **todo** — console only; required for Tom's own login |
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

**4. Enable Email/Password *and* Google sign-in** in the console, then
**bootstrap the first admin** with `functions/scripts/set-admin-claim.mjs`.

Both providers are needed. Tom signs in to the admin console with the Google
account that already owns Firebase, Gmail and the studio calendar
(`tom.gbtt@gmail.com`), and clients may use Google too — but an invited client
who has no Google account can only ever use the password they set from their
invitation email, so Email/Password cannot be turned off. The `role` claim cannot be
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

- **Session generation is not scheduled.** Sessions come from either
  `seed-timetable.mjs` or, preferably, defining a season and pressing
  **Generate sessions**, which covers the whole term at once. Neither runs by
  itself, so somebody has to extend the timetable before it runs out. A
  scheduled function rolling the next week forward is the obvious follow-up.
- **Member screens still read the local store for display.** Bookings, counts,
  attendance and money all come from Firestore, but a signed-in member's name,
  plan and locked-slot list are rendered from the seed store via
  `bindMemberSession`. That binding exists only so the page renders after a
  Firebase sign-in; it grants nothing, since rules and callables check the Auth
  token. It should go once those screens read Firestore directly.
- **The Firestore path has never run against live data.** It is typechecked,
  built and covered by rules tests, but every browser check to date exercised
  the local development fallback. The first real booking, roll call, weekly lock
  and archive are all worth watching directly.

Recently closed, for reference:

- The subscription double-charge is fixed. The tier's per-class rate is the
  whole price and every held seat is billed at it, with no plan fee on top.
- Account activation no longer uses an emailed key. That key was inlined into
  the published bundle by Vite, so anyone could read it and self-activate;
  Firebase email verification replaced it.

### Roles

Three roles, all carried as a `role` custom claim on the Auth token:

| Role | Who | What it opens |
|------|-----|---------------|
| `admin` | Tom | Everything |
| `trainer` | A client Tom has elevated | Schedule and role-call; not legal, notify, billing settings or site content |
| `member` | A client | Their own profile and bookings |

`trainer` was previously called `substitute`. The rename is complete across the
rules, functions, shared logic and UI, and user-visible text reads “Trainer”.
Nothing needed migrating — Auth held no accounts with the old claim — but
`requireStaff` in `functions/src/index.ts`, `isTrainer()` in `firestore.rules`
and `studioRole()` in `shared/studio/studioAuth.ts` each still accept a legacy
`substitute` claim as equivalent, so a token minted before the rename keeps
working. Each carries a comment; the fallback can be deleted once no legacy
claims exist.

### Google sign-in and invited clients

Both the admin console (`studioStaffLoginWithGoogle`) and the member app
(`studioLoginWithGoogle`) offer Google alongside email and password. A Google
sign-in is held to exactly the same checks as a password one: the role comes
from the custom claim, the `users/{uid}` profile must exist, and a suspended
profile is refused.

Two cases are handled deliberately:

- **Never invited.** A Google sign-in with no `users/{uid}` profile is signed
  straight back out and told to ask the studio for an invitation. No profile is
  created, so signing in with Google is not a back door to self-enrolment.
- **Invited, then signs in with Google.** `createMemberAccount` creates an Auth
  user with an email and no password, so the account exists before its owner
  first signs in. Google sign-in on that same address adopts the existing uid,
  which is what keeps their `users/{uid}` profile matching.

  Checked against the Auth emulator (`accounts:signInWithIdp` with a Google
  assertion for an address an admin-created user already holds): the uid was
  preserved, `google.com` was linked to that same account, and no error was
  raised. The same held for an account that already had a password. One thing to
  watch in that second case: after the Google sign-in the account listed
  `google.com` as its *only* provider, so a client who signs in with Google may
  find their password no longer works and have to use “forgot password”. Worth
  confirming on the live project before telling clients otherwise.

  Where Firebase refuses to link the two instead —
  `auth/account-exists-with-different-credential`, which the "one account per
  email address" setting can produce — the client is told to use their email and
  password or ask the studio, rather than being shown a raw Firebase error.

### Security model

Members book through the `bookSession` / `cancelBooking` callables, never by writing Firestore
directly. Rules deny client roster writes, so capacity, membership status and the transfer window
are enforced in one place that cannot be bypassed from the browser console.

Self-registration creates a `pending` profile with no booking rights. A subscription stays pending
until an admin calls `approveMember`, which sets `profile.status: active` and the `member` custom
claim.

Casual drop-in accounts are the exception: they activate on their first booking provided the Auth
record shows a verified email, checked server-side in `requireActiveMember`. Making someone wait for
manual approval to pay for a single class defeats the point of a drop-in, and a confirmed address is
enough to show the account is a real person who can be invoiced.

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
2. **Authentication** → Sign-in method → enable **Email/Password** *and* **Google**.
   Both are required: Google is how Tom signs in, and Email/Password is the only
   route for a client who has no Google account. For the Google provider, set the
   project support email to Tom's address; no client secret is needed for the web
   SDK. Leave **one account per email address** at its default — see “Google
   sign-in and invited clients” below for why that matters.
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
| `.env` | `VITE_FORM_ENDPOINT` |
| `apps/.env` | `VITE_FORM_ENDPOINT`, `VITE_APP_BASE=/app/`, all `VITE_FIREBASE_*` |
| `functions/.env` | `FORM_ENDPOINT`, `FUNCTIONS_WEBHOOK_SECRET` (emulator / local only) |

---

## 4. Apps Script (Tom deploys from repo)

1. Open the Google Sheet used for enquiries.
2. Extensions → Apps Script → paste / sync `google-apps-script/Code.gs` (comprehensive version when merged).
3. **Project settings → Script properties**:

| Property | Purpose |
|----------|---------|
| `NOTIFY_EMAIL` | Tom’s inbox for admin notifications. Defaults to `Tom.GBTT@gmail.com` if unset |
| `CALENDAR_ID` | Shared studio Google Calendar ID. Value: `d33869728efbe6bcbb6639433e96141db8a89b6919e1f4b7169f9c2cbbd93912@group.calendar.google.com` |
| `FUNCTIONS_WEBHOOK_SECRET` | Must match Firebase `FUNCTIONS_WEBHOOK_SECRET` |

4. Deploy → **New deployment** → Web app:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the deployment URL → `VITE_FORM_ENDPOINT` (GitHub Secret) and `FORM_ENDPOINT` (Functions).

> **The activation key is gone.** Firebase email verification replaced it, and
> the `activation` action, its `ACTIVATION_KEY` property and the matching
> `VITE_ACTIVATION_KEY` have been deleted from `Code.gs` and the env examples.
> Set neither. Removing it also closed a hole: `activation` was a *public*
> action that emailed whatever address the caller supplied, so anyone who found
> the endpoint could have used it to send mail under the studio's name. The only
> remaining public action is `enquiry`, which mails Tom's own inbox.
>
> If the script project already has an `ACTIVATION_KEY` property from an earlier
> deployment, delete it — it is now read by nothing.

> **Calendar write access.** The web app runs as Tom (`Execute as: Me`), so it
> acts on the shared calendar with his permissions. He must hold **Make changes
> to events** on that calendar, not just view rights, or `calendarUpsertSession`
> and `calendarDeleteSession` fail at the point of writing rather than at
> configuration time. The first run touching `CalendarApp` also prompts for the
> Calendar scope; until that consent is given the calls error out. Trigger it
> once from the editor rather than discovering it on a live booking.

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

- **Public read**: `catalog/*`, `classTypes`, `timetableSlots`, `sessions` (summary), `siteContent`
- **Signed-in read, admin write**: `pricingPlans`, `pricingDiscounts`, `seasons`
- **Members**: own `users/{uid}` and subcollections
- **Staff**: `admin` or `trainer` custom claim on Auth token (a legacy
  `substitute` claim is still accepted as `trainer`)
- **Server-only**: `guestPasses` writes, `billingPeriods` writes, audit entries

> **Path shape.** Firestore documents live at an *even* number of path
> segments, so `pricing/plans/{planId}` and `catalog/classTypes/{id}` are
> collection paths and no document can exist at either. These were corrected to
> the top-level `pricingPlans`, `pricingDiscounts` and `classTypes`
> collections. If you seeded anything under the old paths, it is unreachable.

### Seasons, holidays and charging

A season is an admin-defined date range with closure periods carved out of it,
edited under **Seasons & holidays** in the admin console. The same screen
describes an eight-week term, a short summer block or a full year — only the
dates differ. A season decides two things:

- **Which sessions exist.** *Generate sessions* fans the recurring
  `timetableSlots` across the season, skipping closures. It is safe to re-run:
  sessions are keyed by slot and week so they update in place, and any now
  falling inside a closure are archived rather than deleted, so rosters and
  attendance survive.
- **What a member is charged.** Each pricing tier carries a per-class rate
  (drop-in $17, $15 at one a week, $13 at two, $11 at three by default) and
  that rate *is* the price — there is no separate plan fee on top.

Two charging modes, set per season:

| Mode | When invoiced | Holidays |
| --- | --- | --- |
| `arrears` | After the season, from seats actually held | Handled automatically — a closed week creates no sessions, so no seats and no charge |
| `upfront` | At enrolment, via `projectSeasonInvoice` | Counted out of the projection, so the quote is already net of closures |

Billing charges for every **seat held**, attended or not: a booked seat holds a
place nobody else could take, which is what the non-refundable terms cover.
Cancelling before the transfer window removes the roster entry and the charge
with it. Drop-ins bill at the rate they were quoted when booked, not the
current list price.

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

   # promote a client to trainer, so they can run the schedule in Tom's absence
   node functions/scripts/set-admin-claim.mjs --key <key> --email <addr> --role trainer

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
2. Callable `createMemberAccount` with `{ email, name, phone, planId }` → new `users/{uid}` doc
   carrying `profile.phone`.
3. Member receives invite / reset email.
4. Or do it from the console: **Add client accounts** tab → type rows or paste
   `name, email, phone` from the client spreadsheet → **Create accounts & email
   invitations**. Each client is emailed an invitation to set their own password;
   a row that fails stays on screen with its reason while the rest go through.

### E. Roster → Calendar

1. Admin or trainer updates `sessions/{id}/roster/{uid}` in Firestore (or via app when wired).
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
- [ ] Trainer can role-call but not edit site content / billing settings
- [ ] Tom can sign in to the admin console with Google
- [ ] An invited client can sign in with Google on the address they were invited at
- [ ] GitHub Pages production deploy shows live timetable (public read)
- [ ] De-demo audit: no “simulated” copy in production paths

Execution is **code-complete** after this repo ships; **integration-complete** after this checklist is done and smoke tests pass.
