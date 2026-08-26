import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import toIco from 'to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const src = path.join(root, 'public', 'brand', 'gbtt-logo.png')
const outDir = path.join(root, 'public')
const simPublic = path.join(root, 'sim-demos', 'public')

if (!fs.existsSync(src)) {
  console.error('Missing source logo at', src)
  process.exit(1)
}

async function paddedPng(size) {
  const inner = Math.round(size * 0.86)
  const logo = await sharp(src)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toBuffer()
}

async function writePng(file, size) {
  const buf = await paddedPng(size)
  fs.writeFileSync(path.join(outDir, file), buf)
  return buf
}

const sizes = [
  ['favicon-16x16.png', 16],
  ['favicon-32x32.png', 32],
  ['apple-touch-icon.png', 180],
  ['android-chrome-192x192.png', 192],
  ['android-chrome-512x512.png', 512],
]

const pngs = {}
for (const [file, size] of sizes) {
  pngs[file] = await writePng(file, size)
  console.log('wrote', file)
}

const ico = await toIco([
  await paddedPng(16),
  await paddedPng(32),
  await paddedPng(48),
])
fs.writeFileSync(path.join(outDir, 'favicon.ico'), ico)
console.log('wrote favicon.ico')

const ogLogo = await sharp(src)
  .resize(420, 420, { fit: 'contain', background: { r: 10, g: 10, b: 10, alpha: 1 } })
  .png()
  .toBuffer()

const og = await sharp({
  create: {
    width: 1200,
    height: 630,
    channels: 3,
    background: { r: 10, g: 10, b: 10 },
  },
})
  .composite([{ input: ogLogo, gravity: 'centre' }])
  .png()
  .toBuffer()
fs.writeFileSync(path.join(outDir, 'og-image.png'), og)
console.log('wrote og-image.png')

const manifest = {
  name: 'Golden Bay Team Training',
  short_name: 'GBTT',
  description: 'Group fitness classes at Rec Park Centre, Tākaka.',
  start_url: './',
  display: 'standalone',
  background_color: '#0a0a0a',
  theme_color: '#0a0a0a',
  icons: [
    {
      src: 'android-chrome-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: 'android-chrome-512x512.png',
      sizes: '512x512',
      type: 'image/png',
    },
  ],
}
fs.writeFileSync(path.join(outDir, 'site.webmanifest'), JSON.stringify(manifest, null, 2))
console.log('wrote site.webmanifest')

if (fs.existsSync(simPublic)) {
  for (const file of [
    'favicon.ico',
    'favicon-16x16.png',
    'favicon-32x32.png',
    'apple-touch-icon.png',
    'android-chrome-192x192.png',
    'android-chrome-512x512.png',
    'site.webmanifest',
  ]) {
    const from = path.join(outDir, file)
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(simPublic, file))
    }
  }
  console.log('copied icons into sim-demos/public')
}

console.log('done')
