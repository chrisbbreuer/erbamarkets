import type { CLI } from '@stacksjs/types'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import process from 'node:process'
import { log } from '@stacksjs/cli'
import { ExitCode } from '@stacksjs/types'
import {
  decode,
  encode,
  imageToSplatHash,
  resize,
  splatHashToBase64,
  splatHashToDataURL,
  splatHashToRgba,
} from 'ts-images'

/**
 * Pre-sizes the photographs this site owns, and computes the placeholder that
 * stands in for each one while it arrives.
 *
 * Every image under `public/images/erba/` was being served at full size to
 * every viewport: `indoor-tree.jpg` is 584KB of a 2500px-wide photograph, and
 * a phone showing it 340px wide downloaded all of it. There was no `srcset`
 * anywhere on the site, so there was nothing for the browser to choose from.
 *
 * This writes the variants next to a manifest that `resources/functions/images`
 * reads, so a view asks for an image by its original path and gets back the
 * whole set - widths, dimensions and placeholder - without knowing any of this
 * happened.
 *
 * Committed rather than generated on deploy. The variants change only when
 * somebody replaces a photograph, and putting an image toolchain on the
 * critical path of every deploy buys nothing for a set of fifteen files that
 * has not changed since launch.
 *
 * Run it after adding or replacing anything in `public/images/erba/`:
 *
 *   ./buddy images:build
 */

/** Where the originals live, and where the variants go beside them. */
const SOURCE_DIRS = ['public/images/erba']
const SINGLE_FILES = ['public/images/erba-logo.png']
const OUTPUT_DIR = 'public/images/opt'
const MANIFEST = 'resources/functions/image-manifest.ts'

/**
 * The ladder.
 *
 * Chosen against what the layout actually asks for rather than as round
 * numbers: 200 is the wordmark on a 2x phone, 340 a full-bleed phone card,
 * 640 a two-up tablet tile, 960 a hero panel on a laptop, and 1600 that same
 * panel on a 2x display, which is the widest anything on this site is ever
 * painted. Nothing above it, because a 2000px variant of a 2500px source is
 * 210KB against the original's 246KB - all of the weight for none of the
 * saving. Anything wider than its source is skipped rather than upscaled.
 */
const WIDTHS = [200, 340, 640, 960, 1280, 1600]

/**
 * WebP only, and deliberately.
 *
 * Every source in `erba/` is already a WebP carrying a `.jpg` extension - see
 * the note in `images.ts` - so there is no format gain left to find, and AVIF
 * encoding refuses any input with an alpha channel, which all of these have.
 * A second format for a marginal saving is not worth a fallback chain.
 */
const FORMAT = 'webp'
const QUALITY = 78

interface Variant { w: number, h: number, path: string, bytes: number }

export interface ImageEntry {
  /** Intrinsic size of the source, so a view never has to guess an aspect. */
  width: number
  height: number
  /** The variants, narrowest first. Empty when the source is already small. */
  variants: Variant[]
  /** A 16-byte SplatHash, base64. Kept for tooling; the page uses `splat`. */
  hash: string
  /** The hash decoded to a 32x32 BMP data URL - a CSS-ready blur placeholder. */
  splat: string
  /** The average of that placeholder, for places too dense to inline the URL. */
  tone: string
}

export default function (cli: CLI) {
  cli
    .command('images:build', 'Generate width variants and blur placeholders for the site\'s own photography')
    .option('--check', 'Report what would change without writing anything', { default: false })
    .alias('images')
    .action(async (options: { check?: boolean }) => {
      try {
        const sources = await collectSources()

        if (!sources.length) {
          log.error('No source images found. Expected files under public/images/erba/.')
          process.exit(ExitCode.FatalError)
        }

        log.info(`Processing ${sources.length} images…`)

        if (!options.check) {
          // Cleared first. Narrowing the ladder or renaming a source
          // otherwise leaves orphans behind that nothing references and no
          // later run will ever notice.
          await rm(OUTPUT_DIR, { recursive: true, force: true })
          await mkdir(OUTPUT_DIR, { recursive: true })
        }

        const manifest: Record<string, ImageEntry> = {}
        let sourceBytes = 0
        let variantBytes = 0

        for (const source of sources) {
          const entry = await processOne(source, Boolean(options.check))
          manifest[publicPath(source)] = entry
          sourceBytes += Bun.file(source).size
          variantBytes += entry.variants.reduce((total, variant) => total + variant.bytes, 0)

          const narrowest = entry.variants[0]
          log.info(
            `  ${publicPath(source)}  ${entry.width}x${entry.height}`
            + `  →  ${entry.variants.length} variants`
            + (narrowest ? `, from ${kb(narrowest.bytes)}` : ' (already small)'),
          )
        }

        if (options.check) {
          log.info('--check: nothing written.')
          process.exit(ExitCode.Success)
        }

        // Sorted keys so the file does not reorder itself between runs and
        // show up as a diff nobody made.
        const ordered = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)))
        await writeFile(MANIFEST, manifestModule(ordered))

        log.success(`Wrote ${MANIFEST}`)
        log.success(`Sources ${kb(sourceBytes)} → variants ${kb(variantBytes)} across ${WIDTHS.length} widths`)
        process.exit(ExitCode.Success)
      }
      catch (error) {
        log.error(`images:build failed: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(ExitCode.FatalError)
      }
    })
}

async function collectSources(): Promise<string[]> {
  const found: string[] = []

  for (const dir of SOURCE_DIRS) {
    const entries = await readdir(dir).catch(() => [] as string[])
    for (const name of entries) {
      if (/\.(?:jpe?g|png|webp)$/i.test(name))
        found.push(join(dir, name))
    }
  }

  for (const file of SINGLE_FILES) {
    if (await Bun.file(file).exists())
      found.push(file)
  }

  return found.sort()
}

/** `public/images/erba/people.jpg` is `/images/erba/people.jpg` to a browser. */
function publicPath(file: string): string {
  return file.replace(/^public/, '')
}

async function processOne(source: string, dryRun: boolean): Promise<ImageEntry> {
  const buffer = new Uint8Array(await Bun.file(source).arrayBuffer())
  const image = await decode(buffer)

  const hash = imageToSplatHash(image as any)
  const stem = basename(source, extname(source))
  const transparent = hasTransparency(image as any)

  const variants: Variant[] = []

  for (const width of WIDTHS) {
    // Never upscale. A 1500px logo asked for at 2000 would be a bigger file
    // carrying no more detail than the source it came from.
    if (width >= image.width)
      continue

    const height = Math.round((image.height / image.width) * width)
    const path = `${OUTPUT_DIR}/${stem}-${width}.${FORMAT}`

    if (dryRun) {
      variants.push({ w: width, h: height, path: publicPath(path), bytes: 0 })
      continue
    }

    const scaled = resize(image as any, { width, kernel: 'lanczos3' })
    /*
     * Lossless whenever the source is actually see-through.
     *
     * ts-images' lossy WebP encoder discards the alpha channel: the wordmark
     * is white artwork on transparency, and every one of its 698,227 clear
     * pixels came back opaque, so the logo arrived in a pale box. Lossless
     * keeps it. This is decided per image rather than per format because
     * `hasAlpha` is true for all of these files - the photographs carry a
     * fully opaque alpha channel they never use - and encoding those
     * losslessly would multiply their weight for nothing.
     */
    const encoded = await encode(scaled as any, FORMAT, transparent
      ? { quality: QUALITY, lossless: true }
      : { quality: QUALITY })
    await writeFile(path, encoded)
    variants.push({ w: width, h: height, path: publicPath(path), bytes: encoded.length })
  }

  return {
    width: image.width,
    height: image.height,
    variants,
    hash: splatHashToBase64(hash),
    splat: splatHashToDataURL(hash),
    tone: averageTone(hash),
  }
}

/**
 * The placeholder collapsed to one colour.
 *
 * A decoded SplatHash is a 4KB data URL, which is nothing on a page carrying
 * three of them and 2.5MB on a menu carrying six hundred. Somewhere that
 * dense, a card gets the average instead: twenty bytes, and at 150px square
 * the difference between a soft blur and a flat tone is most of the effect
 * for none of the weight.
 */
function averageTone(hash: Uint8Array): string {
  const { rgba } = splatHashToRgba(hash)
  let r = 0
  let g = 0
  let b = 0
  let count = 0

  for (let i = 0; i < rgba.length; i += 4) {
    r += rgba[i] ?? 0
    g += rgba[i + 1] ?? 0
    b += rgba[i + 2] ?? 0
    count++
  }

  const channel = (total: number) => Math.round(total / count).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

/**
 * Whether an image is meaningfully see-through.
 *
 * Not `metadata.hasAlpha`, which is true for every file here: the source
 * photographs are WebPs carrying an alpha channel they never use, and
 * trusting the flag sends all of them down the lossless path — the hero went
 * from 49KB to 326KB that way.
 *
 * Nor "any pixel below 255", because `hero-inside` and `indoor-tree` each
 * contain exactly 5000 fully clear pixels out of four million, which is a
 * decoder artefact rather than a design. The wordmark, which is genuinely
 * see-through, is 64% clear. A one-percent floor sits in the wide gap between
 * those two and needs no tuning.
 */
const TRANSPARENCY_FLOOR = 0.01

function hasTransparency(image: { data: Uint8ClampedArray | Uint8Array }): boolean {
  const total = image.data.length / 4
  let clear = 0

  for (let i = 3; i < image.data.length; i += 4) {
    if ((image.data[i] ?? 255) < 250)
      clear++
  }

  return clear / total > TRANSPARENCY_FLOOR
}

/**
 * The manifest as a module rather than as JSON.
 *
 * stx server scripts cannot import a `.json` file: doing so does not fail
 * loudly, it takes the whole `<script server>` block down with it, and the
 * page renders with every server value undefined — a marquee reading
 * `--brand-pan: NaNs` and a locations section with no locations. A generated
 * `.ts` avoids the question and carries its types with it.
 */
function manifestModule(entries: Record<string, ImageEntry>): string {
  return `/* eslint-disable */
// Generated by \`buddy images:build\`. Do not edit by hand.
//
// A module and not a .json, because stx server scripts cannot import JSON —
// see the note beside manifestModule() in app/Commands/BuildImages.ts.

import type { ImageEntry } from './images'

export const IMAGE_MANIFEST: Record<string, ImageEntry> = ${JSON.stringify(entries, null, 2)}
`
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`
}
