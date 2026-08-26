/**
 * Copy generated class primaries into public folders as responsive JPEG/WebP cards.
 * Source PNGs: assets/class-{id}.png (Cursor assets) or img/classes/{id}/primary.png
 *
 * Run: node scripts/process-class-images.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOCAL_ASSETS = path.resolve(ROOT, 'assets')
const CURSOR_ASSETS = path.resolve(
  process.env.USERPROFILE || process.env.HOME || ROOT,
  '.cursor/projects/c-GitHub-GBTT/assets',
)
const IMG_CLASSES = path.resolve(ROOT, 'img/classes')
const PUBLIC_CLASSES = path.resolve(ROOT, 'public/images/classes')
const SIM_PUBLIC = path.resolve(ROOT, 'sim-demos/public/images/classes')

const CLASS_IDS = [
  'sweat',
  'strong',
  'circuits',
  'womens-fit',
  'mobility',
  'bodybalance',
  'sculpt-strength',
  'youth-fit',
  'kids-fit',
]

const CARD_WIDTHS = [480, 800, 1200]
const JPEG_Q = 82
const WEBP_Q = 76

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function findSource(id) {
  const names = [`class-${id}.png`, `${id}.png`]
  for (const base of [LOCAL_ASSETS, CURSOR_ASSETS, path.join(IMG_CLASSES, id)]) {
    for (const name of names) {
      const p = path.join(base, name)
      if (fs.existsSync(p)) return p
    }
    const primaryJpg = path.join(base, 'primary.jpg')
    if (fs.existsSync(primaryJpg)) return primaryJpg
    const primary = path.join(base, 'primary.png')
    if (fs.existsSync(primary)) return primary
  }
  return null
}

async function writeVariants(pipe, outDir, basename) {
  for (const width of CARD_WIDTHS) {
    const resized = pipe.clone().resize({ width, fit: 'inside', withoutEnlargement: true })
    await resized.clone().jpeg({ quality: JPEG_Q, mozjpeg: true }).toFile(path.join(outDir, `${basename}-${width}.jpg`))
    await resized.clone().webp({ quality: WEBP_Q }).toFile(path.join(outDir, `${basename}-${width}.webp`))
  }
}

async function processClass(id) {
  const source = findSource(id)
  if (!source) {
    console.warn(`skip ${id}: no source image`)
    return false
  }

  const outDirs = [
    path.join(IMG_CLASSES, id),
    path.join(PUBLIC_CLASSES, id),
    path.join(SIM_PUBLIC, id),
  ]
  outDirs.forEach(ensureDir)

  const meta = await sharp(source).metadata()
  const primaryJpg = path.join(IMG_CLASSES, id, 'primary.jpg')
  await sharp(source).jpeg({ quality: JPEG_Q, mozjpeg: true }).toFile(primaryJpg)

  for (const dir of outDirs) {
    fs.copyFileSync(primaryJpg, path.join(dir, 'primary.jpg'))
    await writeVariants(sharp(source), dir, 'card')
  }

  console.log(`ok ${id} (${meta.width}x${meta.height})`)
  return true
}

async function main() {
  ensureDir(IMG_CLASSES)
  ensureDir(PUBLIC_CLASSES)
  ensureDir(SIM_PUBLIC)

  let ok = 0
  for (const id of CLASS_IDS) {
    if (await processClass(id)) ok++
  }
  console.log(`done ${ok}/${CLASS_IDS.length} classes`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
