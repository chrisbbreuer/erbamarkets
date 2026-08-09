/**
 * The pure bits of the site model — the ones that decide what a customer reads.
 *
 * This file replaces 41 tests that arrived with the scaffold. Every one of
 * them was a byte-identical copy of the framework's own suite, asserting on
 * `storage/framework/defaults/...`, which a generated app does not have —
 * `buddy new` deletes the vendored framework right after copying it in. So all
 * 41 failed on ENOENT from the first commit, and 117 red tests is the same as
 * no tests at all: nobody reads the list.
 */

import { describe, expect, test } from 'bun:test'
import { money, potency, telHref } from '../resources/functions/site'

describe('money', () => {
  test('drops a trailing .00 rather than printing $30.00', () => {
    expect(money(3000)).toBe('$30')
  })

  test('keeps cents when there are any', () => {
    expect(money(3050)).toBe('$30.50')
    expect(money(999)).toBe('$9.99')
  })

  test('handles zero and sub-dollar amounts', () => {
    expect(money(0)).toBe('$0')
    expect(money(5)).toBe('$0.05')
  })
})

describe('telHref', () => {
  test('strips formatting to something dialable', () => {
    expect(telHref('310-207-1900')).toBe('tel:+13102071900')
    expect(telHref('(310) 207 1900')).toBe('tel:+13102071900')
  })
})

describe('potency', () => {
  /*
   * The distinction that matters: a gummy pack's "100" is 100 milligrams in
   * the pack, not 100 percent of its weight. Both live in one
   * `thc_percentage` column, so a seeded 20-pack rendered as "THC 100.0%" —
   * reading as the strongest thing on the menu instead of 5mg a piece.
   */
  test('doses edibles and wellness in milligrams', () => {
    expect(potency(100, 'edibles')).toBe('100mg')
    expect(potency(25, 'wellness')).toBe('25mg')
  })

  test('prints whole milligrams without a decimal', () => {
    expect(potency(100, 'edibles')).not.toContain('.')
  })

  test('keeps a fractional milligram dose', () => {
    expect(potency(2.5, 'edibles')).toBe('2.5mg')
  })

  test('doses everything else as a percentage, to one decimal', () => {
    expect(potency(24, 'flower')).toBe('24.0%')
    expect(potency(87.5, 'concentrates')).toBe('87.5%')
  })

  test('prints nothing when there is no number to print', () => {
    // An unset potency should leave the label off, not render "0.0%".
    expect(potency(0, 'flower')).toBe('')
    expect(potency(null, 'flower')).toBe('')
    expect(potency(undefined, 'edibles')).toBe('')
    expect(potency('', 'flower')).toBe('')
  })
})
