/**
 * Which shop the customer is ordering from.
 *
 * Every price on the site is a price at one of two counters, so this is the
 * value the whole storefront hangs on. It is also the one the live site never
 * asks for: both location pages there link to the same generic picker, and the
 * picker only offers West LA.
 */

import { describe, expect, test } from 'bun:test'
import { resolveStoreSlug, STORE_COOKIE } from '../resources/functions/site'

const stores = [
  { slug: 'erba-sawtelle', shortName: 'Sawtelle' },
  { slug: 'erba-west-la', shortName: 'West LA' },
] as any[]

describe('resolveStoreSlug', () => {
  test('returns nothing when the customer has not chosen', () => {
    /*
     * Empty is a real answer, not a missing one. Defaulting to a shop would
     * quote one counter's prices to someone who never picked it, and the first
     * they would know is the total at checkout.
     */
    expect(resolveStoreSlug(stores, {})).toBe('')
  })

  test('reads the cookie the switcher sets', () => {
    expect(resolveStoreSlug(stores, { cookies: { [STORE_COOKIE]: 'erba-sawtelle' } })).toBe('erba-sawtelle')
  })

  test('lets ?store= win, so a shared link lands on the shop the sender meant', () => {
    const scope = { cookies: { [STORE_COOKIE]: 'erba-sawtelle' }, query: { store: 'erba-west-la' } }

    expect(resolveStoreSlug(stores, scope)).toBe('erba-west-la')
  })

  test('ignores a slug that is not one of ours', () => {
    // The cookie is client-supplied, and it selects which shop's prices and
    // stock the page reports. An unrecognised value reads as no choice.
    expect(resolveStoreSlug(stores, { cookies: { [STORE_COOKIE]: '../../etc/passwd' } })).toBe('')
    expect(resolveStoreSlug(stores, { query: { store: 'erba-venice' } })).toBe('')
  })

  test('falls back to the cookie when ?store= is not one of ours', () => {
    const scope = { cookies: { [STORE_COOKIE]: 'erba-sawtelle' }, query: { store: 'nope' } }

    expect(resolveStoreSlug(stores, scope)).toBe('erba-sawtelle')
  })

  test('survives being called with no request at all', () => {
    // Seeders, jobs and tests render templates outside a request. They should
    // get the same answer as a first-time visitor, not an exception.
    expect(resolveStoreSlug(stores)).toBe('')
    expect(resolveStoreSlug([], { cookies: { [STORE_COOKIE]: 'erba-west-la' } })).toBe('')
  })
})
