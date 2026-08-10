/**
 * **Cannabis Tax Configuration**
 *
 * The rates a shop *starts* with, and the one setting that is not a rate.
 *
 * These are seeds, not the source of truth. `./buddy seed:catalog` writes them
 * into the `tax_rates` table on a fresh install, and from then on the rates
 * live in the dashboard under Commerce → Taxes, where whoever is responsible
 * for them can change one without a deploy. A rate change is a business
 * decision on a deadline set by the state; making it wait for an engineer is
 * how a shop ends up charging last quarter's number.
 *
 * Editing this file after the first seed changes nothing. Change the rate in
 * the dashboard.
 *
 * ---
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
   * The components, as they are first written into `tax_rates`.
   *
   * `code` is what application code matches on, and it must not change once
   * orders reference it. `exemptible` marks the component a valid medical card
   * lifts — only the sales tax. Excise applies to medicinal cannabis, and Los
   * Angeles levies its business tax on medicinal receipts, so exempting either
   * would be the shop under-collecting tax it owes.
   */
  seedRates: [
    {
      code: 'excise',
      name: 'Cannabis excise tax',
      rate: 15,
      exemptible: false,
      note: 'State excise. Charged on medicinal cannabis too.',
    },
    {
      code: 'sales',
      name: 'State and district sales tax',
      rate: 9.5,
      exemptible: true,
      note: 'The component a valid MMIC removes (Revenue & Taxation Code §34011).',
    },
    {
      code: 'local',
      name: 'Los Angeles cannabis business tax',
      rate: 2.75,
      exemptible: false,
      note: 'Levied on gross receipts, medicinal included.',
    },
  ],

  /**
   * How long a card is trusted after checkout without being re-entered.
   *
   * An MMIC is valid for a year and the county can revoke one sooner, so a
   * stored card is a convenience, not a credential. Re-asked for after this
   * many days regardless of the date printed on it.
   *
   * Not a rate, so it stays here rather than in the dashboard's tax table.
   */
  mmicReverifyDays: 30,
}
