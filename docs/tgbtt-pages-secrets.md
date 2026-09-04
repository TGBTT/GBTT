# TGBTT Pages secrets — admin action

Written for a Cursor session that is logged into GitHub as an **Admin** on
[`TGBTT/GBTT`](https://github.com/TGBTT/GBTT). A Write collaborator cannot set
Actions secrets. Do not paste secret values into this file, into chat, or into
a commit.

## What is broken

Hosting moved from `agent5479/GBTT` to `TGBTT/GBTT`. The Pages workflow on the
new repo built with every Firebase / form secret set to a literal `-`.

The live app therefore initialises Firebase with `projectId: "-"`, so every
callable (calendar subscribe first, then trainer admin) goes to:

`https://australia-southeast1--.cloudfunctions.net/getCalendarSubscribeUrl`

That host resolves on Google’s network, but the certificate is not for it.
Chrome reports `net::ERR_CERT_COMMON_NAME_INVALID`. The functions themselves
are fine — `gbtt-c1130` in `australia-southeast1` answers over TLS.

## What you will do

Copy the four web app keys from the live Firebase project onto **TGBTT/GBTT**
GitHub Actions secrets, set the Apps Script URL, and re-run Pages.

The four `VITE_FIREBASE_*` values are client keys. They already ship in the
public JS bundle. Having them on this machine for the duration of the script is
expected. Firestore rules are what protect the data, not secrecy of the API
key. Still: do not commit them, and do not write them into this document.

`VITE_FORM_ENDPOINT` is the Apps Script `/exec` URL. It is more sensitive than
the Firebase web keys. Read it from the previous repo’s Actions secrets
(`agent5479/GBTT`) or from the current Apps Script deployment — do not invent
it, and do not set it to `-`.

## Prerequisites

In this working copy of `TGBTT/GBTT`, on `main`, with a clean tree:

```powershell
gh auth login          # must be a TGBTT/GBTT Admin
firebase login         # must be able to read project gbtt-c1130
gh repo view --json nameWithOwner,viewerPermission
```

`viewerPermission` must be `ADMIN`. If it is `WRITE` or `MAINTAIN`, stop and
use an Admin account.

## Run

From the repo root (PowerShell):

```powershell
./scripts/sync-github-secrets.ps1 -Repo TGBTT/GBTT
```

That reads `apiKey`, `authDomain`, `projectId`, and `appId` live from Firebase
app `gbtt-c1130` and writes them with `gh secret set`. It does not print the
values.

Then set the form endpoint, substituting the real `/exec` URL:

```powershell
./scripts/sync-github-secrets.ps1 -Repo TGBTT/GBTT -FormEndpoint "https://script.google.com/macros/s/PASTE_DEPLOYMENT_ID/exec"
```

If you are unsure of the URL, list the old repo’s secret *names* (values are
not shown) and copy `VITE_FORM_ENDPOINT` from the GitHub UI, or open the Apps
Script project → Deploy → Manage deployments.

Do not create a GitHub secret whose value is `-`. Vite treats that as
configured and the cert error comes back.

## Redeploy

```powershell
gh workflow run pages.yml --repo TGBTT/GBTT
gh run watch --repo TGBTT/GBTT
```

Wait until it is green. Then confirm the baked-in project id is no longer a
dash:

```powershell
curl.exe -sL "https://gbtt.co.nz/app/" | Select-String "assets/index-"
# download that JS file and confirm it contains gbtt-c1130, not VITE_FIREBASE_PROJECT_ID:`-`
```

On the live member app, calendar subscribe and a trainer callable must no
longer show `ERR_CERT_COMMON_NAME_INVALID`.

## If Pages is still building with dashes

This repo now fails the workflow when any of those secrets is missing or `-`.
If the new check fails, the secrets were not written to **TGBTT/GBTT** (wrong
account, or still on `agent5479/GBTT` only).
