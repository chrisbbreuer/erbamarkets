import { extendModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'
import BaseOrder from '../../storage/framework/defaults/app/Models/commerce/Order'

/**
 * The framework's order, plus the two things a California dispensary has to
 * record about one: which shop is filling it, and whether it was sold as
 * medicine.
 *
 * Extended rather than replaced. Copying the vendored file would mean owning a
 * two-hundred-line divergence that stops tracking upstream at the next
 * release; `extendModel` inherits every field, trait and relation the
 * framework declares — including ones it adds later — and states only what is
 * ours. Everything below is additive.
 *
 * **Which shop.** The commerce bundle has no Store model, so an order had
 * nowhere to record the counter that fulfils it, and with two rooms open
 * neither could tell whose order was whose. That was previously recovered by
 * looking at the cart the order came from; it belongs here.
 *
 * **Whether it is medical.** A qualified patient with a valid MMIC pays no
 * sales tax (Revenue & Taxation Code §34011). That is a fact about the sale
 * and has to survive on the order itself: the exemption is auditable, the
 * Department of Cannabis Control can ask for the card details behind any
 * untaxed line, and a receipt reprinted a year later has to show the same
 * numbers it showed on the day.
 */
export default extendModel(BaseOrder, {
  belongsTo: ['Store'],

  attributes: {
    /**
     * The shop filling this order, by slug.
     *
     * A slug rather than an id because that is what the cart, the storefront
     * cookie and the URL all already speak, and a numeric id here would be the
     * only place the shop is named differently.
     */
    storeSlug: {
      fillable: true,
      default: '',
      validation: { rule: schema.string().max(64) },
      factory: () => 'erba-west-la',
    },

    /** Sold under a medical recommendation rather than as adult use. */
    isMedical: {
      fillable: true,
      default: false,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    /**
     * The card the sales-tax exemption was claimed against.
     *
     * Stored because the exemption has to be defensible on audit — an untaxed
     * line with no card behind it is the shop's liability, not the customer's.
     * Nine digits, as issued by the county under Health & Safety Code
     * §11362.71.
     */
    mmicNumber: {
      fillable: true,
      default: '',
      validation: { rule: schema.string().max(32) },
      factory: () => '',
    },

    /**
     * When that card expires, as printed on it.
     *
     * Kept alongside the number so a later reader can tell whether the card
     * was valid *on the day of the sale*, which is the only date that matters
     * and is not recoverable from a card that has since lapsed.
     */
    mmicExpiresAt: {
      fillable: true,
      default: '',
      validation: { rule: schema.string().max(32) },
      factory: () => '',
    },

    /**
     * Sales tax not charged because of the exemption, in cents.
     *
     * Recorded rather than recomputed. Rates change — the state excise rate
     * moved twice in three years — and a receipt has to keep showing what was
     * actually charged, not what today's configuration would produce.
     */
    exemptedTaxAmount: {
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },
  },
})
