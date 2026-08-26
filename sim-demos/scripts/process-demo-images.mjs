/**
 * Process primary demo photos into responsive showcase cards + square tiles.
 * Cards: full frame scaled down (no crop). Tiles: distinct square crops.
 *
 * Outputs mirrored to:
 *   - img/demos/{id}/
 *   - sim-demos/public/images/demos/{id}/
 *
 * Run: npm run images  (from sim-demos/)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const SIM_PUBLIC = path.resolve(__dirname, '../public/images/demos')
const IMG_DEMOS = path.resolve(ROOT, 'img/demos')

const DEMOS = [
  'coastal',
  'adventure',
  'mohua',
  'bayhop',
  'bayfix',
  'tradeboard',
  'canopy',
  'orchard',
  'freshcoat',
  'paintboard',
  'studioflow',
  'classboard',
  'shoreride',
  'yardboard',
  'harbourbook',
  'hallboard',
  'hiverun',
  'apiary',
  'carevisit',
  'rounds',
]

const CARD_WIDTHS = [480, 800, 1200]
const TILE_WIDTHS = [360, 720]
const JPEG_Q = 80
const WEBP_Q = 74

const TILE_REGIONS = null // unused — regions computed per-image by tileRegionsFor()


const OBSOLETE = [
  /^hero-\d+\.(jpg|webp)$/,
  /^cutout-/,
]

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function clearObsolete(dir) {
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    if (OBSOLETE.some((re) => re.test(name))) {
      fs.unlinkSync(path.join(dir, name))
    }
  }
}

function tileRegionsFor(w, h) {
  // True 2×2 quadrant squares with a clear gap between them —
  // each tile shows a different part of the primary with no shared content.
  const gap = Math.max(24, Math.round(Math.min(w, h) * 0.08))
  const halfW = Math.floor((w - gap) / 2)
  const halfH = Math.floor((h - gap) / 2)
  const side = Math.min(halfW, halfH)
  const ox = Math.floor((halfW - side) / 2)
  const oy = Math.floor((halfH - side) / 2)
  return [
    { left: ox, top: oy, width: side, height: side }, // NW quadrant
    { left: halfW + gap + ox, top: oy, width: side, height: side }, // NE quadrant
    { left: ox, top: halfH + gap + oy, width: side, height: side }, // SW quadrant
    { left: halfW + gap + ox, top: halfH + gap + oy, width: side, height: side }, // SE quadrant
  ]
}

async function writeJpegWebp(pipeline, outDir, basename) {
  const jpgPath = path.join(outDir, `${basename}.jpg`)
  const webpPath = path.join(outDir, `${basename}.webp`)
  const jpgTmp = `${jpgPath}.tmp`
  const webpTmp = `${webpPath}.tmp`
  await pipeline.clone().jpeg({ quality: JPEG_Q, mozjpeg: true }).toFile(jpgTmp)
  await pipeline.clone().webp({ quality: WEBP_Q }).toFile(webpTmp)
  replaceFile(jpgTmp, jpgPath)
  replaceFile(webpTmp, webpPath)
  return { jpg: `${basename}.jpg`, webp: `${basename}.webp` }
}

function replaceFile(tmp, dest) {
  for (let i = 0; i < 8; i++) {
    try {
      if (fs.existsSync(dest)) fs.unlinkSync(dest)
      fs.copyFileSync(tmp, dest)
      fs.unlinkSync(tmp)
      return
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80 * (i + 1))
    }
  }
  fs.copyFileSync(tmp, dest)
  try {
    fs.unlinkSync(tmp)
  } catch {
    /* ignore */
  }
}

async function processDemo(id) {
  const primaryCandidates = [
    path.join(IMG_DEMOS, id, 'primary.jpg'),
    path.join(SIM_PUBLIC, id, 'primary.jpg'),
    path.join(IMG_DEMOS, `demo-${id}.jpg`),
    path.join(SIM_PUBLIC, `demo-${id}.jpg`),
  ]
  const primary = primaryCandidates.find((p) => fs.existsSync(p))
  if (!primary) {
    console.warn(`skip ${id}: no primary`)
    return null
  }

  const meta = await sharp(primary).metadata()
  const w = meta.width || 1200
  const h = meta.height || 675

  const outDirs = [path.join(IMG_DEMOS, id), path.join(SIM_PUBLIC, id)]
  outDirs.forEach((dir) => {
    ensureDir(dir)
    clearObsolete(dir)
    const destPrimary = path.join(dir, 'primary.jpg')
    if (path.resolve(primary) !== path.resolve(destPrimary)) {
      const tmp = `${destPrimary}.copytmp`
      fs.copyFileSync(primary, tmp)
      replaceFile(tmp, destPrimary)
    }
  })

  const aspect = w / h
  const manifest = {
    id,
    primary: 'primary.jpg',
    width: w,
    height: h,
    aspect,
    card: { widths: CARD_WIDTHS, fit: 'inside', jpg: {}, webp: {}, heights: {} },
    tiles: { count: 4, widths: TILE_WIDTHS, files: [] },
  }

  // Showcase cards: full frame shrunk (no crop) — keep original proportions
  for (const width of CARD_WIDTHS) {
    const height = Math.max(1, Math.round(width / aspect))
    const pipe = sharp(primary).resize({
      width,
      height,
      fit: 'inside',
      withoutEnlargement: true,
    })
    for (const dir of outDirs) {
      const files = await writeJpegWebp(pipe, dir, `card-${width}`)
      manifest.card.jpg[width] = files.jpg
      manifest.card.webp[width] = files.webp
      manifest.card.heights[width] = height
    }
  }

  const regions = tileRegionsFor(w, h)
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i]
    const tileEntry = { index: i, region, jpg: {}, webp: {} }
    for (const width of TILE_WIDTHS) {
      const pipe = sharp(primary)
        .extract(region)
        .resize({ width, height: width, fit: 'cover' })
      for (const dir of outDirs) {
        const files = await writeJpegWebp(pipe, dir, `tile-${i}-${width}`)
        tileEntry.jpg[width] = files.jpg
        tileEntry.webp[width] = files.webp
      }
    }
    manifest.tiles.files.push(tileEntry)
  }

  for (const dir of outDirs) {
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  }

  console.log(`ok ${id}`)
  return manifest
}

async function main() {
  ensureDir(IMG_DEMOS)
  ensureDir(SIM_PUBLIC)
  const index = {}
  for (const id of DEMOS) {
    const m = await processDemo(id)
    if (m) index[id] = m
  }
  const indexBody = JSON.stringify({ generated: new Date().toISOString(), demos: index }, null, 2)
  fs.writeFileSync(path.join(IMG_DEMOS, 'index.json'), indexBody)
  fs.writeFileSync(path.join(SIM_PUBLIC, 'index.json'), indexBody)
  console.log('done', Object.keys(index).length, 'demos')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
