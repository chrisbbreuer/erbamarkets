import { commerce } from '@stacksjs/commerce'
import taxConfig from '../../config/tax'

/**
 * What a customer owes, and how much of it is tax.
 *
 * The rates come from the `tax_rates` table, which is what the dashboard edits
 * under Commerce → Taxes. They were constants in `config/tax.ts` until the
 * dashboard could hold them; a rate change is a business decision on a
 * deadline the state sets, and making it wait for a deploy is how a shop ends
 * up charging last quarter's number. `config/tax.ts` seeds the table on a
 * fresh install and is not read again.
 *
 * Split out of the checkout route so the arithmetic can be asserted on its
 * own. It decides what people are charged, and an error here is a discrepancy
 * in the shop's books rather than a visual bug.
 */

/** A card, as the customer entered it. */
export interface MmicCard {
  number: string
  /** Expiry as printed on the card, any format `Date` can read. */
  expiresAt: string
}

export interface Totals {
  subtotal: number
  /** Every tax component together — what the receipt calls "Tax". */
  tax: number
  total: number
  /** Sales tax not charged because of a valid MMIC, in cents. */
  exempted: number
  isMedical: boolean
  /** Each component, charged or lifted, for the receipt. */
  components: { code: string, name: string, amount: number, exempted: boolean }[]
}

/**
 * A card number the county could have issued.
 *
 * Format only. There is no public API to check an MMIC against the state
 * registry, so this catches a typo and nothing more — the card itself is
 * checked by a human at handover, which is where the law puts the
 * responsibility anyway. Being strict here would only reject valid patients;
 * being permissive costs nothing, because the exemption is settled at the
 * counter.
 */
export function looksLikeMmic(number: string): boolean {
  return /^[A-Z0-9-]{6,32}$/i.test(number.trim())
}

/**
 * Whether a card is valid on a given day.
 *
 * The date of the *sale*, not today — a receipt reprinted next year has to
 * agree with itself, and an order placed while a card was valid does not stop
 * being exempt when the card lapses.
 */
export function cardIsValidOn(card: MmicCard, when: Date): boolean {
  if (!looksLikeMmic(card.number))
    return false

  const expires = new Date(card.expiresAt)

  if (Number.isNaN(expires.getTime()))
    return false

  // A card is good through the whole of the day printed on it.
  expires.setHours(23, 59, 59, 999)

  return expires.getTime() >= when.getTime()
}

/**
 * The rates to charge, as rows.
 *
 * Falls back to the seeds when the table is empty, which is a fresh checkout
 * before `seed:catalog` has run. Charging nothing would be worse than charging
 * the documented default: a $0 tax line looks deliberate.
 */
export async function activeRates(): Promise<any[]> {
  const rows = await commerce.tax.activeTaxRates()

  if (rows.length)
    return rows

  return taxConfig.seedRates.map((seed, index) => ({
    id: -(index + 1),
    code: seed.code,
    name: seed.name,
    rate: seed.rate,
    exemptible: seed.exemptible,
  }))
}

/**
 * Totals for a bag, given the rates already in hand.
 *
 * Synchronous and rate-injected so a checkout pricing several bags loads once,
 * and so the arithmetic can be asserted without a database.
 *
 * A valid MMIC lifts the components marked exemptible and nothing else — the
 * excise tax applies to medicinal cannabis, and Los Angeles levies its
 * business tax on medicinal receipts. Passing an invalid or expired card is
 * not an error: it is charged as adult use, which is what the counter would do
 * rather than refusing the sale.
 */
export function totalsFrom(subtotal: number, rates: any[], card?: MmicCard | null, when: Date = new Date()): Totals {
  const isMedical = Boolean(card && cardIsValidOn(card, when))
  const breakdown = commerce.tax.breakdownFor(subtotal, rates, { exempt: isMedical })

  return {
    subtotal: breakdown.taxable,
    tax: breakdown.tax,
    total: breakdown.taxable + breakdown.tax,
    exempted: breakdown.exempted,
    isMedical,
    components: breakdown.components.map(component => ({
      code: component.code,
      name: component.name,
      amount: component.amount,
      exempted: component.exempted,
    })),
  }
}

/** Totals for a bag, loading the current rates. */
export async function totalsFor(subtotal: number, card?: MmicCard | null, when: Date = new Date()): Promise<Totals> {
  return totalsFrom(subtotal, await activeRates(), card, when)
}

/**
 * Every component added together — the adult-use rate.
 *
 * The commerce schema stores a single `taxRate` per cart line, so there has to
 * be one number to put there. It is the adult-use blend: a medical exemption
 * applies to the bag at checkout, and a line written while the customer is
 * still shopping cannot know whether a card is coming.
 */
export async function blendedRate(): Promise<number> {
  const rates = await activeRates()

  return rates.reduce((total, rate) => total + (Number(rate.rate) || 0) / 100, 0)
}
