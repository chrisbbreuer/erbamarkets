import tax from '../../config/tax'

/**
 * What a customer owes, and how much of it is tax.
 *
 * Split out of the checkout route so the arithmetic can be asserted on its
 * own. It decides what people are charged, and a rounding error here is a
 * discrepancy in the shop's books rather than a visual bug.
 */

/** A card, as the customer entered it. */
export interface MmicCard {
  number: string
  /** Expiry as printed on the card, any format `Date` can read. */
  expiresAt: string
}

export interface Totals {
  subtotal: number
  excise: number
  salesTax: number
  localTax: number
  /** Every tax component together — what the receipt calls "Tax". */
  tax: number
  total: number
  /** Sales tax not charged because of a valid MMIC, in cents. */
  exempted: number
  isMedical: boolean
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
 * Totals for a bag.
 *
 * A valid MMIC removes the sales-tax component and nothing else: the excise
 * tax applies to medicinal cannabis, and Los Angeles levies its business tax
 * on medicinal receipts too. Passing an invalid or expired card is not an
 * error — it is charged as adult use, which is what the counter would do.
 */
export function totalsFor(subtotal: number, card?: MmicCard | null, when: Date = new Date()): Totals {
  const isMedical = Boolean(card && cardIsValidOn(card, when))

  const excise = Math.round(subtotal * tax.exciseRate)
  const localTax = Math.round(subtotal * tax.localRate)
  const fullSalesTax = Math.round(subtotal * tax.salesRate)
  const salesTax = isMedical ? 0 : fullSalesTax

  const total = subtotal + excise + salesTax + localTax

  return {
    subtotal,
    excise,
    salesTax,
    localTax,
    tax: excise + salesTax + localTax,
    total,
    exempted: isMedical ? fullSalesTax : 0,
    isMedical,
  }
}

/**
 * Every component added together — the adult-use rate.
 *
 * The commerce schema stores a single `taxRate` per cart line, so there has to
 * be one number to put there. It is the adult-use blend: a medical exemption
 * applies to the bag at checkout, and a line written while the customer is
 * still shopping cannot know whether a card is coming.
 */
export function blendedRate(): number {
  return tax.exciseRate + tax.salesRate + tax.localRate
}
