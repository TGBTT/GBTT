# GBTT secrets & infrastructure handoff

Complete this checklist before live Firebase integration testing. The app code and Cloud Functions are committed; they stay in a graceful “configuration required” state until these values exist.

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
6. Create the first **admin** user (temporary):
   - Authentication → Add user (Tom’s email).
   - Firestore → `users/{uid}` with `profile.role: admin`.
   - Run once from a secured shell or Admin SDK:

     ```bash
     firebase functions:shell
     # Or use Firebase Admin locally to setCustomUserClaims(uid, { role: 'admin' })
     ```

7. Recommended: set a **budget alert** on Blaze billing.

---

## 2. GitHub repository secrets

Repo → Settings → Secrets and variables → Actions → **Repository secrets**:

| Secret | Value | Used by |
|--------|-------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase web `apiKey` | Marketing site + `apps/` build |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase `authDomain` | Same |
| `VITE_FIREBASE_PROJECT_ID` | Firebase `projectId` | Same |
| `VITE_FIREBASE_APP_ID` | Firebase `appId` | Same |
| `VITE_FORM_ENDPOINT` | Apps Script web app URL | Contact form, activation, Functions |
| `VITE_BASE` | `/` on production (`gbtt.co.nz`) | Marketing site |
| `VITE_APP_BASE` | `/app/` | Member/trainer apps |

Client Firebase keys are not secret in practice (protected by Security Rules), but storing them in GitHub Secrets keeps one deploy path.

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

From repo root (after `npm ci` in `functions/`):

```bash
firebase login
firebase use <project-id>

# String param (Apps Script URL)
firebase functions:params:set FORM_ENDPOINT "https://script.google.com/macros/s/.../exec"

# Secret (shared webhook key)
firebase functions:secrets:set FUNCTIONS_WEBHOOK_SECRET

# Deploy rules, indexes, and functions
firebase deploy --only firestore:rules,firestore:indexes,functions
```

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

Custom claims (`role: admin | substitute | member`) are set via Admin SDK when creating accounts or promoting staff.

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
