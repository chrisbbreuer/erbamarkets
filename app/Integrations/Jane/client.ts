import menu from '../../../config/menu'
import { decodeTurboStream, loaderData } from './turbo-stream'

/**
 * Read ERBA's live menu off Jane.
 *
 * Jane publishes a REST API at `api.iheartjane.com`, and it is unreachable
 * from a server: their edge answers anything without a browser's TLS
 * fingerprint with a challenge page, whatever headers are sent. The retailer's
 * own domain is not behind that, because it has to serve customers, so this
 * goes through `erbamarkets.com/menu` — the same URLs a shopper loads.
 *
 * If ERBA obtains Jane partner credentials, replace `fetchProduct` and
 * `productUrls` with the documented endpoints; the mapping below is unaffected,
 * because it maps the record Jane returns either way.
 */

/** One product, as Jane's menu describes it. */
export interface JaneProduct {
  productId: number
  name: string
  slug: string
  brand: string
  brandLine: string
  /** Jane's `kind`: flower, vape, edible, pre-roll, extract, tincture, topical, gear. */
  kind: string
  /** Jane's `category`: indica, sativa, hybrid, cbd. */
  lineage: string
  description: string
  thc: number
  cbd: number
  /** Cents. */
  price: number
  /** Cents before promotion, 0 when not discounted. */
  compareAtPrice: number
  unitSize: string
  imageUrl: string
  rating: number
  reviewCount: number
  availableForPickup: boolean
  availableForDelivery: boolean
  inStock: boolean
  strain: string
}

const USER_AGENT
  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

async function get(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*' },
  })

  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText} for ${url}`)

  return response.text()
}

/**
 * Every product URL the menu publishes.
 *
 * From the menu's own sitemap, which is the only listing that is complete: the
 * category pages render a page at a time and the API that pages them is behind
 * the edge challenge.
 *
 * The sitemap is a superset of what is in stock — it keeps URLs for products
 * the shop has carried before, so they do not 404 for anyone holding a link.
 * Roughly twice the live count. `fetchProduct` reports stock per product and
 * the caller decides; there is no cheaper way to tell from the URL alone.
 */
export async function productUrls(): Promise<string[]> {
  const xml = await get(`${menu.baseUrl}/sitemap.xml`)
  const paths = xml.match(/\/menu\/products\/\d+\/[a-z0-9-]+/g) ?? []

  return [...new Set(paths)]
}

/** Dollars to cents, guarding the float error that `* 100` introduces. */
function cents(value: unknown): number {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0
}

/**
 * A cannabinoid percentage, or 0 when the lab result is not published.
 *
 * `Number.isFinite`, not `|| 0`. Jane sends `-Infinity` for a potency it does
 * not have — the turbo-stream format has a sentinel for it — and `-Infinity`
 * is truthy, so `Number(x) || 0` passes it straight through to a column
 * declared `min(0).max(100)`. Every unlabelled product then failed to import
 * with `validation failed: thcPercentage, cbdPercentage`, which names the
 * columns and not the reason.
 *
 * Clamped rather than rejected: a shop occasionally publishes a total-
 * cannabinoid figure above 100 by rounding, and refusing the product over it
 * would drop a real item off the menu.
 */
function percent(value: unknown): number {
  const amount = Number(value)

  if (!Number.isFinite(amount) || amount <= 0)
    return 0

  return Math.min(amount, 100)
}

/**
 * The price this store charges, and what it was before any discount.
 *
 * Jane quotes a product at whichever weights the shop sells it in, as a family
 * of `price_<weight>` fields, with `discounted_price_<weight>` beside each. The
 * menu leads with the smallest available weight, so this does too — quoting an
 * ounce next to a product whose card shows an eighth would misrepresent it.
 */
function priceOf(product: Record<string, unknown>): { price: number, compareAt: number, unit: string } {
  const weights: [string, string][] = [
    ['each', ''],
    ['half_gram', '0.5g'],
    ['gram', '1g'],
    ['two_gram', '2g'],
    ['eighth_ounce', '3.5g'],
    ['quarter_ounce', '7g'],
    ['half_ounce', '14g'],
    ['ounce', '28g'],
  ]

  for (const [key, label] of weights) {
    const list = cents(product[`price_${key}`])
    if (!list)
      continue

    // Two discount channels, and a product can carry either: a store special
    // and a brand-funded one. Whichever is actually charged is the lower.
    const discounts = [
      cents(product[`discounted_price_${key}`]),
      cents(product[`special_price_${key}`]),
    ].filter(amount => amount > 0 && amount < list)

    const charged = discounts.length ? Math.min(...discounts) : list

    return {
      price: charged,
      compareAt: charged < list ? list : 0,
      // `amount` is the pack description for anything not sold by weight
      // ("10pk", ".5g"), and is the better label when present.
      unit: label || String(product.amount ?? ''),
    }
  }

  return { price: 0, compareAt: 0, unit: String(product.amount ?? '') }
}

/**
 * Fetch one product.
 *
 * Returns `null` when the URL resolves but the shop no longer carries the item,
 * which is the normal case for most of the sitemap.
 */
export async function fetchProduct(path: string, janeStoreId: number): Promise<JaneProduct | null> {
  const body = await get(`${menu.baseUrl.replace(/\/menu$/, '')}${path}.data?janeStoreId=${janeStoreId}`)
  const data = loaderData(decodeTurboStream(body), 'products.$productId')

  if (!data)
    return null

  const detail = data.productDetail as { product?: Record<string, unknown> } | undefined
  const product = detail?.product

  if (!product || !product.product_id)
    return null

  const { price, compareAt, unit } = priceOf(product)

  // No price means the shop lists it but cannot sell it — a placeholder row in
  // their POS. Treating it as free would put a $0 item on the menu.
  if (!price)
    return null

  const images = Array.isArray(product.image_urls) ? product.image_urls as string[] : []

  return {
    productId: Number(product.product_id),
    name: String(product.name ?? '').trim(),
    slug: path.split('/').pop() ?? '',
    brand: String(product.brand ?? '').trim(),
    brandLine: String(product.brand_subtype ?? '').trim(),
    kind: String(product.kind ?? '').trim(),
    lineage: String(product.category ?? 'hybrid').trim(),
    description: String(product.description ?? '').trim(),
    thc: percent(product.percent_thc),
    cbd: percent(product.percent_cbd),
    price,
    compareAtPrice: compareAt,
    unitSize: unit,
    imageUrl: images[0] ?? '',
    rating: Number.isFinite(Number(product.aggregate_rating)) ? Math.max(0, Number(product.aggregate_rating)) : 0,
    reviewCount: Number.isFinite(Number(product.review_count)) ? Math.max(0, Number(product.review_count)) : 0,
    availableForPickup: product.available_for_pickup !== false,
    availableForDelivery: product.available_for_delivery !== false,
    inStock: data.isOutOfStock !== true,
    strain: String(product.strain ?? '').trim(),
  }
}

/** `pickup` / `delivery` / `both` / `none`, as StoreProduct records it. */
export function fulfillmentOf(product: JaneProduct): string {
  if (product.availableForPickup && product.availableForDelivery)
    return 'both'
  if (product.availableForPickup)
    return 'pickup'
  if (product.availableForDelivery)
    return 'delivery'

  return 'none'
}
