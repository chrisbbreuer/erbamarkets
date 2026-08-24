import { decode, imageToSplatHash, splatHashToRgba } from 'ts-images'

/**
 * The colour a product card shows while its photograph is still arriving.
 *
 * Everything under `public/images` gets a proper blur placeholder from
 * `buddy images:build`, which can open the file. Product photography cannot
 * work that way: it lives on Jane's CDN, so nothing in a build has ever seen
 * it, and deriving one while a page renders would mean six hundred outbound
 * fetches before the first byte of HTML. So it happens once, at import, and
 * the answer is stored on the product row.
 *
 * A single colour rather than a blur, and that is a decision about weight
 * rather than a shortcut. A decoded SplatHash is a 4.2KB data URL: fine on a
 * page carrying three of them, 2.5MB on a menu carrying six hundred. The
 * average of the photograph costs twenty bytes and, in a card 150px wide, is
 * most of what the blur was buying.
 *
 * The average is taken from the SplatHash rather than from the full image on
 * purpose — the hash is already a 32x32 summary weighted toward what the eye
 * notices, so its mean tracks the photograph's character better than the mean
 * of four million pixels, which drifts toward whatever the background is.
 */

/** Jane answers 403 to a request with no User-Agent, which is what fetch sends. */
const USER_AGENT = 'ERBA Markets menu sync (+https://www.erbamarkets.com)'

/** Long enough for a slow CDN, short enough not to stall a nightly import. */
const TIMEOUT_MS = 20_000

/**
 * When to stop trying for the rest of the run.
 *
 * The import walks twelve hundred products one at a time, so this is a
 * decision about the worst case rather than the normal one: if Jane starts
 * refusing us — a blocked user agent, a CDN change, an outage — every single
 * one of those would burn the full timeout, and a nightly sync that takes ten
 * minutes would take seven hours instead.
 *
 * Ten consecutive failures is well past what a few slow images look like and
 * well short of anything expensive. The import continues without placeholders;
 * they are a nicety and the catalogue is not.
 */
const CONSECUTIVE_FAILURE_LIMIT = 10

let consecutiveFailures = 0

/** Lets a long-lived process start over — a scheduled run, or a retry. */
export function resetPlaceholderCircuit(): void {
  consecutiveFailures = 0
}

/**
 * @returns a hex colour, or an empty string if the image could not be read.
 *   Never throws: a card without a placeholder is the state this whole file is
 *   an improvement on, and it is not worth failing an import over.
 */
export async function averageColourOf(url: string): Promise<string> {
  if (!url || !/^https?:\/\//i.test(url))
    return ''

  if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT)
    return ''

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      consecutiveFailures++
      return ''
    }

    const image = await decode(new Uint8Array(await response.arrayBuffer()))
    const { rgba } = splatHashToRgba(imageToSplatHash(image as any))

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

    if (!count)
      return ''

    consecutiveFailures = 0
    const channel = (total: number) => Math.round(total / count).toString(16).padStart(2, '0')
    return `#${channel(r)}${channel(g)}${channel(b)}`
  }
  catch {
    consecutiveFailures++
    return ''
  }
}
