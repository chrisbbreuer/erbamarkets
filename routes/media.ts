import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { route } from '@stacksjs/router'
import { decode, encode, resize } from 'ts-images'

/**
 * A resizer for the product photography we do not host.
 *
 * The menu's six hundred products come from Jane, and Jane serves originals:
 * one of them is a 2509x2509 JPEG weighing 875KB, and it is shown in a card
 * 150px wide. Their CDN ignores `?width`, `?w`, `?fm`, `?tr` and every other
 * resize parameter anyone has agreed on, so there is no way to ask them for a
 * smaller one — which left the menu pulling hundreds of megabytes of
 * photography to draw thumbnails.
 *
 * So this fetches an image once, resizes it, encodes WebP, and writes it to
 * disk. Every request after that is a file read.
 *
 * It does not compute a blur placeholder. Ours come from `buddy images:build`
 * and are read out of a manifest while the page renders; doing the same for a
 * remote image would mean six hundred disk reads per menu render, or six
 * hundred outbound fetches, and neither is worth it. The place for that is a
 * column on the product row, filled by `menu:sync` when it imports the
 * catalogue — the card would then carry the hash it already has. Until then
 * remote cards hold their space with `.card-media`'s own background and get
 * the sizing, which is the part that was costing megabytes.
 *
 * Mounted at the site root by `app/Routes.ts` and forwarded by the views
 * server through `proxy.prefixes` in `config/server.ts`.
 */

/**
 * Where a request may point.
 *
 * This is the whole security model and it has to be an allowlist. An image
 * proxy that fetches any URL it is handed is an SSRF hole: `?src=http://169.254.169.254/…`
 * reads cloud instance metadata, `?src=http://localhost:3008/api/…` reads
 * anything on the box that trusts the loopback. Naming the two hosts we
 * actually buy photography from closes both, and costs nothing — the set
 * changes when the menu provider does.
 */
const ALLOWED_HOSTS = new Set([
  'product-assets.iheartjane.com',
  'uploads.iheartjane.com',
])

/**
 * And how large.
 *
 * A fixed ladder rather than any integer, so the cache has a bounded number
 * of entries per image. Without it, one crawler walking `?w=1` to `?w=4000`
 * fills the disk with four thousand renders of the same photograph.
 */
const ALLOWED_WIDTHS = new Set([160, 240, 320, 480, 640, 960])

const CACHE_DIR = 'storage/framework/cache/images'
const QUALITY = 74

/** A year. The URL contains the source and the width, so it cannot go stale. */
const CACHE_CONTROL = 'public, max-age=31536000, immutable'

/** Requests in flight, so twenty cards of the same image fetch it once. */
const inFlight = new Map<string, Promise<Uint8Array | null>>()

route.get('/img', async (request: any) => {
  const src = String(request.query?.src ?? request.input?.('src') ?? '')
  const width = Number(request.query?.w ?? request.input?.('w') ?? 0)

  const url = parseSource(src)

  if (!url || !ALLOWED_WIDTHS.has(width))
    return new Response('Bad image request', { status: 400 })

  const key = cacheKey(url.href, width)
  const file = join(CACHE_DIR, `${key}.webp`)

  const cached = await readFile(file).catch(() => null)

  if (cached) {
    return new Response(cached.buffer.slice(cached.byteOffset, cached.byteOffset + cached.byteLength) as ArrayBuffer, {
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': CACHE_CONTROL, 'X-Image-Cache': 'hit' },
    })
  }

  const rendered = await renderOnce(key, url.href, width, file)

  if (!rendered) {
    /*
     * Redirect to the original rather than 404.
     *
     * If Jane is down or the photograph has moved, a broken card is a worse
     * answer than a heavy one. 302 and not 301: the failure is usually
     * temporary and a permanent redirect would be cached by browsers long
     * after it stopped being true.
     */
    return new Response(null, { status: 302, headers: { Location: url.href } })
  }

  return new Response(rendered.slice().buffer as ArrayBuffer, {
    headers: { 'Content-Type': 'image/webp', 'Cache-Control': CACHE_CONTROL, 'X-Image-Cache': 'miss' },
  })
})

function parseSource(src: string): URL | null {
  if (!src)
    return null

  try {
    const url = new URL(src)

    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname))
      return null

    return url
  }
  catch {
    return null
  }
}

function cacheKey(href: string, width: number): string {
  return `${createHash('sha256').update(`${href}|${width}`).digest('hex').slice(0, 32)}-${width}`
}

/** One render per key at a time, however many requests arrive together. */
function renderOnce(key: string, href: string, width: number, file: string): Promise<Uint8Array | null> {
  const existing = inFlight.get(key)

  if (existing)
    return existing

  const work = render(href, width, file).finally(() => inFlight.delete(key))
  inFlight.set(key, work)
  return work
}

async function render(href: string, width: number, file: string): Promise<Uint8Array | null> {
  try {
    /*
     * Jane answers 403 to a request with no User-Agent, which is what `fetch`
     * sends by default, so the first version of this returned a broken image
     * for every product on the menu.
     */
    const response = await fetch(href, {
      headers: { 'User-Agent': 'ERBA Markets image proxy (+https://www.erbamarkets.com)' },
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok)
      return null

    const source = new Uint8Array(await response.arrayBuffer())
    const image = await decode(source)

    // Never upscale: a 120px product shot asked for at 640 would be a larger
    // file carrying no more detail than the one it came from.
    const target = Math.min(width, image.width)
    const scaled = target < image.width ? resize(image as any, { width: target, kernel: 'lanczos3' }) : image
    const encoded = await encode(scaled as any, 'webp', { quality: QUALITY })

    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(file, encoded)

    return encoded
  }
  catch {
    return null
  }
}
