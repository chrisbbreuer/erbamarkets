/**
 * Decode the payload React Router serves from a `.data` URL.
 *
 * Jane's menu is a React Router 7 app, and every route exposes its loader
 * output at `<route>.data`. That is a far better source than the rendered HTML:
 * the grid virtualises, so scrolling the page never puts more than about thirty
 * products in the DOM at once, while the loader hands over the whole record —
 * potency, every weight's price, delivery eligibility, stock.
 *
 * The wire format is a flattened graph rather than plain JSON. The response is
 * one array in which every value, and every object *key*, is an index into that
 * same array, so a string repeated across five hundred products is stored once.
 * `{"_1": 2}` means `{ arr[1]: arr[2] }`.
 *
 * Two consequences shape the decoder below. The graph may contain cycles, so
 * resolution memoises by index and seeds the memo before recursing. And
 * negative indices are sentinels rather than positions — the dialect uses them
 * for `undefined`, `null`, `NaN` and friends — so they never index the array.
 */

/** Sentinels the format uses in place of a position. */
const SENTINELS: Record<number, unknown> = {
  [-1]: undefined,
  [-2]: null,
  [-3]: Number.NaN,
  [-4]: Number.POSITIVE_INFINITY,
  [-5]: Number.NEGATIVE_INFINITY,
  [-6]: -0,
  [-7]: undefined,
}

export type Decoded = unknown

/**
 * Resolve the node at `index` into an ordinary JavaScript value.
 *
 * `seen` is threaded through rather than closed over so a caller can resolve
 * several roots against one memo, which is what makes a cyclic payload
 * terminate.
 */
export function resolveNode(flat: unknown[], index: number, seen = new Map<number, unknown>()): Decoded {
  if (index < 0)
    return SENTINELS[index]

  if (seen.has(index))
    return seen.get(index)

  if (index >= flat.length)
    return undefined

  const node = flat[index]

  if (Array.isArray(node)) {
    const out: unknown[] = []
    // Seeded before the walk: an element may point back at this array.
    seen.set(index, out)

    for (const item of node)
      out.push(typeof item === 'number' ? resolveNode(flat, item, seen) : item)

    return out
  }

  if (node !== null && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    seen.set(index, out)

    for (const [rawKey, value] of Object.entries(node as Record<string, unknown>)) {
      // Keys are `_<index>` when interned, and literal otherwise.
      const key = rawKey.startsWith('_')
        ? String(resolveNode(flat, Number(rawKey.slice(1)), seen))
        : rawKey

      out[key] = typeof value === 'number' ? resolveNode(flat, value, seen) : value
    }

    return out
  }

  seen.set(index, node)
  return node
}

/**
 * Decode a whole `.data` response.
 *
 * The body is one JSON array per line — later lines are deferred chunks the
 * client streams in. Everything this importer wants is resolved by the time
 * the first line is written, so the rest are ignored.
 */
export function decodeTurboStream(body: string): Record<string, unknown> {
  const firstLine = body.split('\n', 1)[0]

  if (!firstLine)
    throw new Error('empty .data response')

  let flat: unknown[]

  try {
    flat = JSON.parse(firstLine) as unknown[]
  }
  catch (error) {
    // Nearly always an HTML error page — an edge challenge, or a 404 shaped
    // like a page. Say which, because the JSON parse error alone sends people
    // looking for a bug in the decoder.
    const opening = firstLine.slice(0, 60)
    throw new Error(`.data response was not turbo-stream JSON (starts "${opening}"): ${(error as Error).message}`)
  }

  const root = resolveNode(flat, 0)

  if (root === null || typeof root !== 'object')
    throw new Error('.data root did not resolve to an object')

  return root as Record<string, unknown>
}

/**
 * The loader payload for the first route whose id contains `fragment`.
 *
 * Route ids carry the file path — `routes/_menu.products.$productId.$slug` —
 * so matching on a fragment survives Jane renaming the surrounding layout,
 * which they have done at least once already.
 */
export function loaderData(root: Record<string, unknown>, fragment: string): Record<string, unknown> | undefined {
  for (const [routeId, value] of Object.entries(root)) {
    if (!routeId.includes(fragment))
      continue

    const data = (value as { data?: unknown } | null)?.data

    if (data && typeof data === 'object')
      return data as Record<string, unknown>
  }

  return undefined
}
