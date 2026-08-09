/**
 * Decoding the point of sale's `.data` payloads.
 *
 * The importer reads the live menu through React Router's loader endpoints,
 * whose wire format is a flattened graph: every value and every object key is
 * an index into one array, so a string repeated across six hundred products is
 * stored once. Getting the decode wrong does not throw — it yields a plausible
 * object with the wrong values in it — so the cases below are the ones that
 * silently produce nonsense.
 */

import { describe, expect, test } from 'bun:test'
import { decodeTurboStream, loaderData, resolveNode } from '../app/Integrations/Jane/turbo-stream'

describe('resolveNode', () => {
  test('resolves interned keys and values', () => {
    // [ {name: value}, "name", "Strawnana" ]
    const flat = [{ _1: 2 }, 'name', 'Strawnana']

    expect(resolveNode(flat, 0)).toEqual({ name: 'Strawnana' })
  })

  test('resolves arrays through the same index table', () => {
    const flat = [[1, 2], 'a', 'b']

    expect(resolveNode(flat, 0)).toEqual(['a', 'b'])
  })

  test('terminates on a cycle', () => {
    /*
     * The payload is a graph, not a tree — a product references its store and
     * the store's product list references the product. Without memoising
     * before the walk this recurses until the stack gives out.
     */
    const flat: unknown[] = [{ _1: 0 }, 'self']
    const out = resolveNode(flat, 0) as Record<string, unknown>

    expect(out.self).toBe(out)
  })

  test('reads negative indices as sentinels, not positions', () => {
    // -2 is null in this dialect. Treated as an index it would return
    // flat[-2], which is undefined — the same shape, quietly wrong.
    expect(resolveNode([{ _1: -2 }, 'value'], 0)).toEqual({ value: null })
  })

  test('keeps a literal key that was not interned', () => {
    expect(resolveNode([{ name: 1 }, 'Strawnana'], 0)).toEqual({ name: 'Strawnana' })
  })

  test('returns undefined for an index past the end rather than throwing', () => {
    expect(resolveNode([{ _1: 99 }, 'value'], 0)).toEqual({ value: undefined })
  })
})

describe('decodeTurboStream', () => {
  test('decodes the first chunk and ignores deferred ones', () => {
    const body = `[{"_1":2},"name","Strawnana"]\n[{"deferred":1}]`

    expect(decodeTurboStream(body)).toEqual({ name: 'Strawnana' })
  })

  test('names the real cause when the response is an HTML error page', () => {
    /*
     * The usual failure in practice: an edge challenge or a 404 shaped like a
     * page. The bare JSON parse error sends people looking for a bug in the
     * decoder, so the message says what actually arrived.
     */
    expect(() => decodeTurboStream('<!DOCTYPE html><html>Attention Required</html>'))
      .toThrow(/not turbo-stream JSON/)
  })

  test('rejects an empty body', () => {
    expect(() => decodeTurboStream('')).toThrow(/empty/)
  })
})

describe('loaderData', () => {
  const root = {
    'root': { data: { unrelated: true } },
    'routes/_menu.products.$productId.$slug': { data: { isOutOfStock: false } },
  }

  test('finds a route by fragment, so a layout rename does not break it', () => {
    expect(loaderData(root, 'products.$productId')).toEqual({ isOutOfStock: false })
  })

  test('returns undefined when no route matches', () => {
    expect(loaderData(root, 'checkout')).toBeUndefined()
  })
})
