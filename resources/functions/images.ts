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
 * it always used and names the shape of the slot it goes in:
 *
 *   const hero = image('/images/erba/hero-inside.jpg', SIZES.hero)
 *
 *   <Photo src="{{ hero.src }}" srcset="{{ hero.srcset }}" sizes="{{ hero.sizes }}"
 *          width="{{ hero.width }}" height="{{ hero.height }}"
 *          placeholder="{{ hero.placeholder }}" alt="…" priority />
 *
 * Spelled out rather than spread: stx has no object-spread in a tag, so the
 * attributes are written once per call site and that is simply what it costs.
 *
 * A path with no manifest entry degrades to exactly what was there before: the
 * `src` it was given, no srcset, no placeholder. Nothing 404s because an image
 * was added and the build was not re-run.
 */

import { IMAGE_MANIFEST } from './image-manifest'

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

const entries = IMAGE_MANIFEST

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
  /** The hero figure: 95vw on a phone, a little under half the shell above 1024. */
  hero: '(min-width: 1024px) 45vw, 95vw',
  /** A story chapter's photograph, which sits in the narrower of two columns. */
  story: '(min-width: 1024px) 40vw, 95vw',
  /** A storefront card. Two across from 900px, full width below it. */
  storefront: '(min-width: 900px) 50vw, 90vw',
  /** A delivery or bento tile: three across on a desktop, two on a tablet. */
  fact: '(min-width: 1100px) 33vw, (min-width: 700px) 50vw, 90vw',
  /** A product card in the menu grid: four across on a desktop, two on a phone. */
  card: '(min-width: 1024px) 23vw, 48vw',
  /** The wordmark, which is 98px at its widest and never changes. */
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

/**
 * The same thing for photography we do not host.
 *
 * The menu's products come from Jane, who serve originals and ignore every
 * resize parameter there is: one product shot is a 2509x2509 JPEG at 875KB,
 * drawn in a card 150px wide. These point at `/img` instead, which fetches
 * each one once, resizes it, and caches the WebP — the same photograph comes
 * back at 12KB.
 *
 * Only hosts `routes/media.ts` will actually serve are rewritten; anything
 * else is handed back untouched rather than pointed at a route that would
 * refuse it. The two lists have to agree, and this is the one that fails
 * safely if they drift.
 */
const PROXIED_HOSTS = ['product-assets.iheartjane.com', 'uploads.iheartjane.com']

/** A subset of the widths `routes/media.ts` allows. Keep them in step. */
export const REMOTE_WIDTHS = {
  /** A menu or shelf card: 143px on a phone, 303px four-up on a desktop. */
  card: [160, 240, 320, 480, 640],
  /** The photograph on a product page, which is half the shell at most. */
  detail: [320, 480, 640, 960],
} as const

export function remoteImage(src: string, sizes: string, widths: readonly number[] = REMOTE_WIDTHS.card): ImageAttrs {
  const empty = { src: src || '', srcset: '', sizes: '', width: '', height: '', placeholder: '' }

  if (!src || !PROXIED_HOSTS.some(host => src.includes(host)))
    return empty

  const at = (width: number) => `/img?src=${encodeURIComponent(src)}&w=${width}`

  return {
    ...empty,
    // The middle of the ladder as `src`, not the widest: this is what a
    // browser without `srcset` gets, and on this site that is far more likely
    // to be a small screen than a large one.
    src: at(320),
    srcset: widths.map(width => `${at(width)} ${width}w`).join(', '),
    sizes,
  }
}

/**
 * A product photograph, wherever it happens to live.
 *
 * The menu mixes two kinds: the seeded catalogue points at files we own and
 * pre-built with `buddy images:build`, while the live import points at Jane.
 * A card should not have to know which it got, and the answer differs — ours
 * already have variants on disk and a placeholder computed, theirs have to go
 * through the resizer. Anything that is neither is handed back untouched.
 */
export function productImage(src: string, sizes: string, widths: readonly number[] = REMOTE_WIDTHS.card): ImageAttrs {
  return entries[src] ? image(src, sizes) : remoteImage(src, sizes, widths)
}

function widest(entry: ImageEntry): ImageVariant | undefined {
  return entry.variants[entry.variants.length - 1]
}
