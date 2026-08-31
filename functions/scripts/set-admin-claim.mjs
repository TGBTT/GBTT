#!/usr/bin/env node
/**
 * One-off bootstrap: grant a Firebase Auth user a staff role.
 *
 * Firestore rules gate on the `role` custom claim (request.auth.token.role),
 * which cannot be set from the Firebase console — only via the Admin SDK.
 * That makes this script the only way to create the FIRST admin. Afterwards
 * Tom can manage staff from the app via the createMemberAccount function.
 *
 * Usage (run from the repo root):
 *   node functions/scripts/set-admin-claim.mjs --key ./sa.json --email tom@example.com
 *   node functions/scripts/set-admin-claim.mjs --key ./sa.json --uid AbC123 --role trainer
 *   node functions/scripts/set-admin-claim.mjs --key ./sa.json --email tom@example.com --show
 *
 * Creating the first admin, who then sets their own password from the link:
 *   node functions/scripts/set-admin-claim.mjs --key ./sa.json \
 *     --email tom.gbtt@gmail.com --name "Thomas Lake" --create
 *
 * The service-account key is a full-project credential: keep it out of the
 * repo and delete it once the claim is set.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const VALID_ROLES = ['admin', 'trainer', 'member']

function parseArgs(argv) {
  const args = { role: 'admin', show: false, create: false, invite: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    switch (arg) {
      case '--key':
      case '--email':
      case '--uid':
      case '--role':
      case '--name':
        args[arg.slice(2)] = argv[++i]
        break
      case '--show':
        args.show = true
        break
      case '--create':
        args.create = true
        break
      case '--invite':
        args.invite = true
        break
      case '--help':
      case '-h':
        args.help = true
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

function usage() {
  console.log(`
Grant a staff role via Firebase custom claims.

  --key <path>    Service account JSON. Falls back to GOOGLE_APPLICATION_CREDENTIALS.
  --email <addr>  Target user by email (or use --uid).
  --uid <uid>     Target user by UID.
  --role <role>   ${VALID_ROLES.join(' | ')}   (default: admin)
  --name <name>   Display name used when --create makes a new user.
  --create        Create the Auth user if it does not exist.
  --invite        Print a set-password link for the user (implied by --create).
  --show          Print current claims and exit without changing anything.
`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    usage()
    return
  }

  if (!args.email && !args.uid) {
    throw new Error('Provide --email or --uid. Use --help for usage.')
  }

  if (!VALID_ROLES.includes(args.role)) {
    throw new Error(`--role must be one of: ${VALID_ROLES.join(', ')}`)
  }

  const keyPath = args.key ?? process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!keyPath) {
    throw new Error(
      'No credentials. Pass --key <service-account.json> or set GOOGLE_APPLICATION_CREDENTIALS.',
    )
  }

  let credential
  let projectId
  if (args.key) {
    const raw = JSON.parse(readFileSync(resolve(args.key), 'utf8'))
    projectId = raw.project_id
    credential = cert(raw)
  } else {
    credential = applicationDefault()
  }

  initializeApp({ credential, projectId })
  const auth = getAuth()
  const db = getFirestore()

  let user
  try {
    user = args.uid ? await auth.getUser(args.uid) : await auth.getUserByEmail(args.email)
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err
    if (!args.create) {
      throw new Error(
        `No user found for ${args.uid ?? args.email}. ` +
          'Create them in Authentication first, or re-run with --create.',
      )
    }
    user = await auth.createUser({ email: args.email, displayName: args.name ?? args.email })
    console.log(`Created Auth user ${user.uid}`)
  }

  const current = user.customClaims ?? {}
  console.log(`User    : ${user.email ?? '(no email)'}`)
  console.log(`UID     : ${user.uid}`)
  console.log(`Claims  : ${JSON.stringify(current)}`)

  if (args.show) return

  if (current.role === args.role) {
    console.log(`\nAlready has role "${args.role}" — no claim change needed.`)
    // Still worth a link: re-running to recover a lost password is the whole
    // reason someone would invoke this against an existing admin.
    await printInviteLink(auth, user, args)
    return
  }

  // Merge so we never clobber unrelated claims set elsewhere.
  await auth.setCustomUserClaims(user.uid, { ...current, role: args.role })

  await db.doc(`users/${user.uid}`).set(
    {
      profile: {
        name: args.name ?? user.displayName ?? user.email ?? '',
        email: user.email ?? '',
        role: args.role,
        status: 'active',
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  console.log(`\nRole set to "${args.role}".`)
  console.log(
    'The claim is baked into the ID token, so this user must sign out and back in\n' +
      '(or wait up to an hour for refresh) before admin screens unlock.',
  )

  await printInviteLink(auth, user, args)
}

/**
 * Print a link the user follows to choose their own password.
 *
 * A user created here has no password at all, so without this there is no way
 * in: the sign-in form would reject them and "forgot password" is the only
 * other route. Firebase's reset flow doubles as a set-password flow, so the
 * same link works whether or not one was ever set. It expires, so generate a
 * fresh one rather than reusing an old link.
 */
async function printInviteLink(auth, user, args) {
  if (!args.invite && !args.create) return
  if (!user.email) {
    console.log('\nNo email on this account, so no set-password link can be generated.')
    return
  }

  const link = await auth.generatePasswordResetLink(user.email)
  console.log(`\nSet-password link for ${user.email}:\n\n${link}\n`)
  console.log('Send it to them, or open it yourself if this is your own account.')
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`)
  process.exit(1)
})
