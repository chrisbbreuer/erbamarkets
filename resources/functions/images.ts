/**
 * What a view needs to know to put a photograph on the page.
 *
 * Every `<img>` on this site used to carry a single `src` at whatever size the
 * file happened to be. `indoor-tree.jpg` is 584KB of a 2500px-wide photograph
 * and a phone was shown all of it inside a 340px column; there was no `srcset`
 * anywhere, so the browser had nothing to choose from and no way to do better.
 *
 * `image()` answers with the whole set instead - the variants `buddy
 * images:build` wrote, the intrinsic dimensions, and a placeholder to hold the
 * space while the real file is still arriving. A view passes the original path
 * it always used and gets the rest for free:
 *
 *   <Image {...image('/images/erba/hero-inside.jpg', HERO_SIZES)} alt="…" />
 *
 * A path with no manifest entry degrades to exactly what was there before: the
 * `src` it was given, no srcset, no placeholder. Nothing 404s because an image
 * was added and the build was not re-run.
 */

import manifest from './image-manifest.json'

/**
 * A note on the sources, because it surprises everyone who looks.
 *
 * Every file in `public/images/erba/` is a WebP carrying a `.jpg` extension,
 * which is why `file` reports `image/webp` and the server sends
 * `Content-Type: image/jpeg` for all of them. Browsers sniff the bytes and
 * cope, so this has never shown up as a bug. It does mean there is no format
 * conversion left to win here: the variants are WebP because the sources
 * already were.
 */

export interface ImageVariant {
  w: number
  h: number
  path: string
  bytes: number
}

export interface ImageEntry {
  width: number
  height: number
  variants: ImageVariant[]
  hash: string
  splat: string
  tone: string
}

export interface ImageAttrs {
  src: string
  srcset: string
  sizes: string
  width: number | string
  height: number | string
  placeholder: string
}

const entries = manifest as unknown as Record<string, ImageEntry>

/**
 * The `sizes` values the layout actually uses, named rather than repeated.
 *
 * `sizes` is the half of responsive images that is easy to get wrong and
 * impossible to notice: the browser picks a variant from it *before* layout,
 * so a wrong value silently downloads the wrong file forever. Keeping them
 * here means each one is written against a real breakpoint once, next to the
 * others, instead of guessed at eleven call sites.
 */
export const SIZES = {
  /** Half the shell from 900px up, full width below it. The hero figure. */
  half: '(min-width: 900px) 46vw, 100vw',
  /** A third of the shell on a desktop: bento tiles and fact cards. */
  third: '(min-width: 1100px) 30vw, (min-width: 700px) 46vw, 100vw',
  /** Four across on a desktop, two on a phone. The product grid. */
  quarter: '(min-width: 1024px) 23vw, 48vw',
  /** Full bleed at every width: the story chapters and store photographs. */
  full: '100vw',
  /** The wordmark, which is 100px wide and never changes. */
  mark: '110px',
} as const

/**
 * Build the attributes for one image.
 *
 * `sizes` has no default worth having. Left off, the browser assumes `100vw`
 * and downloads the widest variant for a tile that is a quarter of the screen,
 * which is the whole problem this function exists to solve — so callers pass
 * one of `SIZES` and the type makes them.
 */
export function image(src: string, sizes: string): ImageAttrs {
  const entry = entries[src]

  if (!entry) {
    return { src, srcset: '', sizes: '', width: '', height: '', placeholder: '' }
  }

  return {
    /*
     * The widest variant as `src`, not the original.
     *
     * `src` is what a browser too old for `srcset` uses, and what everything
     * uses when `sizes` somehow does not apply. The original is the one file
     * in the set nobody ever wants: it is the largest and it is the only one
     * that skipped the encoder.
     */
    src: widest(entry)?.path ?? src,
    srcset: entry.variants.map(variant => `${variant.path} ${variant.w}w`).join(', '),
    sizes,
    width: entry.width,
    height: entry.height,
    placeholder: entry.splat ? `url("${entry.splat}")` : '',
  }
}

/**
 * The same thing, minus the inlined placeholder.
 *
 * A decoded SplatHash is a 4KB data URL. That is nothing on a page carrying
 * three of them and 2.5MB on a menu carrying six hundred, so somewhere that
 * dense the placeholder collapses to its average colour — twenty bytes, and at
 * 150px square most of the effect for none of the weight.
 */
export function imageTone(src: string, sizes: string): ImageAttrs {
  const attrs = image(src, sizes)
  const entry = entries[src]
  return { ...attrs, placeholder: entry?.tone ?? '' }
}

/** The placeholder alone, for an element that is not an `<Image>`. */
export function placeholderFor(src: string): string {
  const entry = entries[src]
  return entry?.splat ? `url("${entry.splat}")` : ''
}

function widest(entry: ImageEntry): ImageVariant | undefined {
  return entry.variants[entry.variants.length - 1]
}
