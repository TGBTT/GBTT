<#
.SYNOPSIS
  Push the GitHub Actions secrets that the Pages build needs.

.DESCRIPTION
  The four VITE_FIREBASE_* values are read live from the Firebase project via
  the Firebase CLI, so they cannot drift from what is actually deployed and no
  key is hard-coded into the repo.

  These four are client-side keys. They ship inside the JS bundle and are public
  by design; Firestore rules are what protect the data. They live in GitHub
  Secrets only to keep a single deploy path, not because they are confidential.

  VITE_FORM_ENDPOINT is the Apps Script web app URL. It only exists once Tom has
  deployed google-apps-script/Code.gs, so it is optional here.

.PREREQUISITES
  firebase login     (Firebase CLI, must have access to the project)
  gh auth login      (GitHub CLI, needs repo admin to write secrets)

.EXAMPLE
  ./scripts/sync-github-secrets.ps1

.EXAMPLE
  ./scripts/sync-github-secrets.ps1 -FormEndpoint "https://script.google.com/macros/s/AKfy.../exec"

.EXAMPLE
  ./scripts/sync-github-secrets.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$ProjectId = 'gbtt-c1130',

  # Apps Script web app URL. Omit until the Apps Script deployment exists.
  [string]$FormEndpoint,

  # Defaults to the GitHub repo of the current directory.
  [string]$Repo
)

$ErrorActionPreference = 'Stop'

function Assert-Command($name, $hint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "'$name' not found on PATH. $hint"
  }
}

# These CLIs write progress and warnings to stderr, which $ErrorActionPreference
# 'Stop' would turn into a terminating NativeCommandError. Capture output with
# the preference relaxed so we can report failures ourselves.
function Invoke-Native([scriptblock]$Command) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $Command 2>&1 | Out-String
    return [pscustomobject]@{ Output = $output; ExitCode = $LASTEXITCODE }
  } finally {
    $ErrorActionPreference = $previous
  }
}

Assert-Command 'firebase' 'Install with: npm install -g firebase-tools'
Assert-Command 'gh'       'Install from: https://cli.github.com'

# --- Verify both CLIs are authenticated before changing anything -------------

# Check exit codes, not output text: "not logged into any GitHub hosts"
# contains the substring "logged in" and would pass a naive match.
if ((Invoke-Native { gh auth status }).ExitCode -ne 0) {
  throw "GitHub CLI is not authenticated. Run: gh auth login"
}

$fb = Invoke-Native { firebase login:list }
if ($fb.ExitCode -ne 0 -or $fb.Output -match 'No authorized accounts') {
  throw "Firebase CLI is not authenticated. Run: firebase login"
}

if (-not $Repo) {
  $Repo = (Invoke-Native { gh repo view --json nameWithOwner --jq .nameWithOwner }).Output.Trim()
  if (-not $Repo -or $Repo -notmatch '^[\w.-]+/[\w.-]+$') {
    throw "Could not determine the repo. Pass -Repo <owner/name>."
  }
}

Write-Host "Repo    : $Repo"
Write-Host "Project : $ProjectId"
Write-Host ''

# --- Read the web app config straight from Firebase --------------------------

Write-Host 'Reading Firebase web app config...'

$appId = ((Invoke-Native { firebase apps:list WEB --project $ProjectId --json }).Output |
  ConvertFrom-Json).result |
  Where-Object { $_.platform -eq 'WEB' } |
  Select-Object -First 1 -ExpandProperty appId

if (-not $appId) {
  throw "No WEB app registered in $ProjectId. Create one with: firebase apps:create WEB `"GBTT Web`""
}

$cfg = ((Invoke-Native { firebase apps:sdkconfig WEB $appId --project $ProjectId --json }).Output |
  ConvertFrom-Json).result.sdkConfig

if (-not $cfg.apiKey) { throw "Could not read the SDK config for app $appId." }

$secrets = [ordered]@{
  VITE_FIREBASE_API_KEY     = $cfg.apiKey
  VITE_FIREBASE_AUTH_DOMAIN = $cfg.authDomain
  VITE_FIREBASE_PROJECT_ID  = $cfg.projectId
  VITE_FIREBASE_APP_ID      = $cfg.appId
}

if ($FormEndpoint) {
  $secrets['VITE_FORM_ENDPOINT'] = $FormEndpoint
  # Same URL under the Functions param name, so a GitHub UI that only lists
  # FORM_ENDPOINT still feeds the Pages build (pages.yml accepts either).
  $secrets['FORM_ENDPOINT'] = $FormEndpoint
}

# --- Write them to GitHub ----------------------------------------------------

foreach ($name in $secrets.Keys) {
  $value = $secrets[$name]
  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Warning "$name resolved empty - skipping."
    continue
  }

  if ($PSCmdlet.ShouldProcess("$Repo/$name", 'set GitHub secret')) {
    $value | gh secret set $name --repo $Repo --body -
    if ($LASTEXITCODE -ne 0) { throw "Failed to set $name" }
    Write-Host "  set $name"
  }
}

Write-Host ''
if (-not $FormEndpoint) {
  Write-Host 'VITE_FORM_ENDPOINT was not set (no -FormEndpoint given).'
  Write-Host 'The contact form falls back to mailto until it is configured.'
  Write-Host ''
}

Write-Host 'Done. Re-run the Pages workflow to bake these into the build:'
Write-Host "  gh workflow run pages.yml --repo $Repo"
