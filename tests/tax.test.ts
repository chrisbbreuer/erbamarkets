/**
 * What a customer is charged.
 *
 * A qualified patient holding a valid MMIC is exempt from sales and use tax on
 * medicinal cannabis (Revenue & Taxation Code §34011), and from nothing else.
 * The two mistakes worth guarding are exempting too much — the excise tax
 * applies to medicine, and Los Angeles levies its business tax on medicinal
 * receipts — and exempting on a card that had already lapsed, which leaves the
 * shop holding the liability rather than the customer.
 */

import { describe, expect, test } from 'bun:test'
import { cardIsValidOn, looksLikeMmic, totalsFrom } from '../resources/functions/tax'

const DAY_OF_SALE = new Date('2026-06-15T12:00:00Z')

/*
 * The rates as the dashboard holds them. Injected rather than loaded so the
 * arithmetic is asserted against a known set — a test that reads whatever the
 * database happens to contain proves nothing about the sums.
 */
const RATES = [
  { id: 1, code: 'excise', name: 'Cannabis excise tax', rate: 15, exemptible: false },
  { id: 2, code: 'sales', name: 'State and district sales tax', rate: 9.5, exemptible: true },
  { id: 3, code: 'local', name: 'Los Angeles cannabis business tax', rate: 2.75, exemptible: false },
]

const totalsFor = (subtotal: number, card?: any, when?: Date) => totalsFrom(subtotal, RATES, card, when)

/** What one component came to, by code — the receipt's own view of the bill. */
const part = (totals: ReturnType<typeof totalsFor>, code: string): number =>
  totals.components.find(component => component.code === code)?.amount ?? -1
const valid = { number: 'A12345678', expiresAt: '2026-12-31' }
const lapsed = { number: 'A12345678', expiresAt: '2026-01-31' }

describe('adult use', () => {
  test('charges every component', () => {
    const t = totalsFor(10000, null, DAY_OF_SALE)

    expect(part(t, 'excise')).toBe(1500)
    expect(part(t, 'sales')).toBe(950)
    expect(part(t, 'local')).toBe(275)
    expect(t.tax).toBe(2725)
    expect(t.total).toBe(12725)
  })

  test('matches the blended rate the storefront already used', () => {
    // The components were split out of a single 27.25%. Nobody's total moves.
    const t = totalsFor(4200, null, DAY_OF_SALE)

    expect(t.tax).toBe(Math.round(4200 * 0.2725))
  })

  test('exempts nothing', () => {
    expect(totalsFor(10000, null, DAY_OF_SALE).exempted).toBe(0)
    expect(totalsFor(10000, null, DAY_OF_SALE).isMedical).toBe(false)
  })
})

describe('a valid MMIC', () => {
  test('drops sales tax and only sales tax', () => {
    const t = totalsFor(10000, valid, DAY_OF_SALE)

    expect(part(t, 'sales')).toBe(0)
    // Both of these still apply to medicine. Exempting them would be the shop
    // under-collecting tax it owes the state and the city.
    expect(part(t, 'excise')).toBe(1500)
    expect(part(t, 'local')).toBe(275)
  })

  test('records what was not charged', () => {
    // An untaxed line with nothing behind it is the shop's liability on audit.
    const t = totalsFor(10000, valid, DAY_OF_SALE)

    expect(t.exempted).toBe(950)
    expect(t.isMedical).toBe(true)
  })

  test('leaves the customer paying less, by exactly the sales tax', () => {
    const adult = totalsFor(10000, null, DAY_OF_SALE)
    const medical = totalsFor(10000, valid, DAY_OF_SALE)

    expect(adult.total - medical.total).toBe(950)
  })
})

describe('a card that does not qualify', () => {
  test('an expired card is charged as adult use', () => {
    const t = totalsFor(10000, lapsed, DAY_OF_SALE)

    expect(t.isMedical).toBe(false)
    expect(part(t, 'sales')).toBe(950)
  })

  test('is not an error — it is what the counter would do', () => {
    expect(() => totalsFor(10000, { number: 'nope!', expiresAt: 'never' }, DAY_OF_SALE)).not.toThrow()
    expect(part(totalsFor(10000, { number: 'nope!', expiresAt: 'never' }, DAY_OF_SALE), 'sales')).toBe(950)
  })

  test('a card is good through the whole of its final day', () => {
    // Expiry is a date, not an instant. Treating it as midnight would refuse a
    // patient on a day their card is still valid.
    const lastDay = new Date('2026-12-31T18:00:00Z')

    expect(cardIsValidOn(valid, lastDay)).toBe(true)
    expect(cardIsValidOn(valid, new Date('2027-01-01T00:01:00Z'))).toBe(false)
  })

  test('validity is judged on the day of the sale, not today', () => {
    /*
     * A receipt reprinted next year has to agree with itself, and an order
     * placed while a card was valid does not stop being exempt when the card
     * later lapses.
     */
    expect(cardIsValidOn(lapsed, new Date('2026-01-02T12:00:00Z'))).toBe(true)
    expect(cardIsValidOn(lapsed, DAY_OF_SALE)).toBe(false)
  })
})

describe('looksLikeMmic', () => {
  test('accepts the shapes counties issue', () => {
    expect(looksLikeMmic('A12345678')).toBe(true)
    expect(looksLikeMmic('19-1234-5678')).toBe(true)
  })

  test('rejects an obvious typo', () => {
    expect(looksLikeMmic('')).toBe(false)
    expect(looksLikeMmic('abc')).toBe(false)
    expect(looksLikeMmic('why would you type this')).toBe(false)
  })
})

describe('rounding', () => {
  test('every component is whole cents', () => {
    // Fractional cents reconcile to a discrepancy in the shop's books.
    const t = totalsFor(3333, null, DAY_OF_SALE)

    for (const amount of [...t.components.map(c => c.amount), t.tax, t.total])
      expect(Number.isInteger(amount)).toBe(true)
  })

  test('the total is exactly its parts', () => {
    const t = totalsFor(3333, valid, DAY_OF_SALE)

    expect(t.total).toBe(t.subtotal + t.components.reduce((sum, c) => sum + c.amount, 0))
  })
})
