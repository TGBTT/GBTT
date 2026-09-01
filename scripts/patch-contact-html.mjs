/**
 * GitHub Pages copies the marketing index.html into /contact/ so the SPA
 * deep-link returns 200. That copy still has home-page canonical, title, and
 * descriptions unless they are rewritten here.
 *
 * Usage: node scripts/patch-contact-html.mjs _site/contact/index.html
 */
import fs from 'node:fs'
import path from 'node:path'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/patch-contact-html.mjs <contact/index.html>')
  process.exit(1)
}

const target = path.resolve(file)
let html = fs.readFileSync(target, 'utf8')

const replacements = [
  [
    '<title>Golden Bay Team Training | Group fitness in Tākaka</title>',
    '<title>Contact Tom | Golden Bay Team Training</title>',
  ],
  [
    'content="Group fitness with Tom at Rec Park Centre, Tākaka, Golden Bay. Sweat, Strong, Circuits, Mobility, BodyBalance, kids and teens — all levels."',
    'content="Contact Tom at Golden Bay Team Training, Rec Park Centre, Tākaka. Enquire about group classes, memberships, and kids or teens sessions."',
  ],
  [
    '<link rel="canonical" href="https://gbtt.co.nz/" />',
    '<link rel="canonical" href="https://gbtt.co.nz/contact/" />',
  ],
  [
    '<meta property="og:url" content="https://gbtt.co.nz/" />',
    '<meta property="og:url" content="https://gbtt.co.nz/contact/" />',
  ],
  [
    '<meta property="og:title" content="Golden Bay Team Training | Group fitness in Tākaka" />',
    '<meta property="og:title" content="Contact Tom | Golden Bay Team Training" />',
  ],
  [
    '<meta name="twitter:title" content="Golden Bay Team Training | Group fitness in Tākaka" />',
    '<meta name="twitter:title" content="Contact Tom | Golden Bay Team Training" />',
  ],
  [
    'content="Group fitness at Rec Park Centre, Tākaka, Golden Bay — all levels, kids and teens welcome."',
    'content="Enquire about GBTT classes at Rec Park Centre, Tākaka — email, call, or send a message."',
  ],
]

for (const [from, to] of replacements) {
  const count = html.split(from).length - 1
  if (count === 0) {
    console.error('patch-contact-html: missing expected string:\n', from)
    process.exit(1)
  }
  html = html.split(from).join(to)
}

fs.writeFileSync(target, html)
console.log('patched', target)
