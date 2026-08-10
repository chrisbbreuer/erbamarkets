/**
 * **Cannabis Tax Configuration**
 *
 * What a California dispensary collects, split into the parts that behave
 * differently — because one of them does not apply to everybody.
 *
 * A qualified patient holding a valid Medical Marijuana Identification Card
 * (Health & Safety Code §11362.71) is exempt from **sales and use tax** on
 * medicinal cannabis (Revenue & Taxation Code §34011 / §6369.6). They are *not*
 * exempt from the cannabis excise tax, and local business taxes are generally
 * passed through to them too. So the exemption is a discount on one component,
 * not a switch that turns tax off — which is exactly why a single blended rate
 * could not express it.
 *
 * Until now this was one number, `TAX_RATE = 0.2725`, applied flat. The parts
 * below add up to the same 27.25%, so nothing changes for an adult-use order.
 *
 * ---
 *
 * **These rates need the client's accountant to confirm them.** Two things in
 * particular:
 *
 *  1. The split reproduces the blended rate that was already in use. It is not
 *     a claim about which statute contributes what.
 *  2. Real California arithmetic compounds — the excise tax forms part of the
 *     base that sales tax is charged on, so the true total is slightly higher
 *     than adding the percentages. This keeps the flat form the storefront has
 *     always used, so no existing customer's total moves. Changing that is a
 *     pricing decision, not a code change, and it belongs to the business.
 */
export default {
  /**
   * State cannabis excise tax.
   *
   * Charged on every retail sale of cannabis, medicinal included. An MMIC does
   * not exempt a patient from it.
   */
  exciseRate: 0.15,

  /**
   * State and district sales and use tax.
   *
   * The part an MMIC exempts. Dropping it is the whole mechanical difference
   * between a medical and an adult-use order.
   */
  salesRate: 0.095,

  /**
   * Local cannabis business tax, passed through at the counter.
   *
   * Los Angeles levies this on gross receipts and it applies to medicinal
   * sales as well, so it stays for MMIC holders.
   */
  localRate: 0.0275,

  /**
   * How long a card is trusted after checkout without being re-entered.
   *
   * An MMIC is valid for a year and the county can revoke one sooner, so a
   * stored card is a convenience, not a credential. Re-asked for after this
   * many days regardless of the date printed on it.
   */
  mmicReverifyDays: 30,
}
