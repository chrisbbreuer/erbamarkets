/**
 * The site model.
 *
 * Every page carries the same header and the same footer, and both read from
 * the catalog: the mega menu counts categories and brands, the footer prints
 * store hours, phone numbers and license numbers. Before this module each page
 * re-derived all of that in its own `<script server>`, which is how /menu and
 * /specials ended up with a header and no footer, and how the three copies of
 * the nav derivation drifted apart.
 *
 * A `<script server>` block runs through Bun's transpiler with a real module
 * resolver behind it, so it can import this file directly:
 *
 *     import { loadSiteModel } from '../functions/site'
 *     const { stores, sawtelle, westla, navCategories } = await loadSiteModel()
 *
 * stx lifts a server script's top-level declarations into the template
 * context, so those names are then readable by `partials/site-nav` and
 * `partials/site-footer` without being plumbed through as props.
 *
 * A pattern spread across several lines is fine as of @stacksjs/stx 0.2.164.
 * Before that only a single-line one was recognised, and a wrapped one was
 * silently dropped: the block still ran, but the template printed
 * `{{ stores }}` as literal text and every `@foreach` over one of those names
 * rendered nothing. If those symptoms ever reappear, check the pinned stx
 * version in package.json's `overrides` before looking at the data.
 *
 * Models are auto-imported as globals inside a view but not inside a plain
 * module, so they are imported here the way the framework's own code does it.
 *
 * One caveat while developing: stx pulls this file in through a dynamic
 * `import()` from inside the server script, and Bun caches a module by path
 * for the life of the process. It is not part of the template graph either, so
 * the file watcher does not know to invalidate anything. Editing this file has
 * no visible effect until `./buddy dev` is restarted - the page keeps serving
 * the version that was loaded first.
 */
import { commerce } from '@stacksjs/commerce'
import Product from '../../app/Models/Product'
import Special from '../../app/Models/Special'
import Store from '../../app/Models/Store'
import StoreProduct from '../../app/Models/StoreProduct'
import Category from '../../storage/framework/defaults/app/Models/commerce/Category'
import Customer from '../../storage/framework/defaults/app/Models/commerce/Customer'
import Manufacturer from '../../storage/framework/defaults/app/Models/commerce/Manufacturer'

/** Cents to a display price, dropping a trailing `.00` so $30 is not `$30.00`. */
export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`
}

/** `310-207-1900` to a dialable href. */
export function telHref(phone: string): string {
  return `tel:+1${String(phone).replace(/\D/g, '')}`
}

export interface StoreView {
  name: string
  slug: string
  shortName: string
  address: string
  addressLine: string
  city: string
  state: string
  postalCode: string
  storePhone: string
  storePhoneHref: string
  deliveryPhone: string
  deliveryPhoneHref: string
  email: string
  license: string
  storeHours: string
  deliveryHours: string
  pickupHours: string
  amenities: string[]
  mapUrl: string
  image: string
  latitude: number
  longitude: number
  deliveryMinimum: string
  deliveryMinimumValue: number
  url: string
  /**
   * Whether this shop's shelves are known to us.
   *
   * Sawtelle trades — the shop is open and the licence is current — but it has
   * never been set up for online ordering, so no inventory reaches us. That is
   * not the same as an empty shelf, and the difference matters: rendering its
   * menu as six hundred sold-out products would be false, and would read as
   * the shop having nothing rather than as us having no feed.
   */
  ordersOnline: boolean
}

export interface ProductView {
  id: number
  name: string
  slug: string
  description: string
  category: string
  categoryName: string
  brand: string
  brandLine: string
  strain: string
  unit: string
  priceCents: number
  price: string
  wasPrice: string
  thc: string
  thcValue: number
  cbd: string
  potencyLabel: string
  /** A hex colour to hold the card while the photograph arrives, or ''. */
  imagePlaceholder: string
  image: string
  rating: string
  reviews: number
  /** `4.3` when rated, empty when not, so a card can branch on one value. */
  ratingLabel: string
  /** `(12)` alongside it. Empty when nobody has reviewed it. */
  reviewsLabel: string
  featured: number
  /**
   * Slugs of the shops that have this in stock right now.
   *
   * A dispensary's two locations hold different inventory, so "in stock" is
   * only ever a statement about one of them. Carrying the list on every card
   * is what lets the menu say "sold out here, in stock at Sawtelle" instead of
   * hiding the product or, worse, selling it from the wrong counter.
   */
  stockedAt: string[]
  /** Whether the shop the customer is currently ordering from has it. */
  inStockHere: boolean
  /** Short names of the other shops that do, for the "also at …" line. */
  alsoAt: string[]
}

export interface SpecialView {
  day: string
  short: string
  title: string
  offer: string
  brands: string[]
  storeOnly: string
  isToday: boolean
}

/**
 * The five names `partials/site-nav` reads, plus the three
 * `partials/site-footer` reads. A page that spreads a site model into its
 * scope gets a working header and footer and nothing else to remember.
 */
export interface SiteModel {
  stores: StoreView[]
  sawtelle: StoreView
  westla: StoreView
  /**
   * The shop the customer is ordering from, or `null` before they pick one.
   *
   * Null is a state the pages render, not one they guard against: with no shop
   * chosen the menu is the union of both, which is the right thing to show
   * someone who has not said where they are.
   */
  selectedStore: StoreView | null
  /** The same thing as a slug, for comparisons in templates. */
  selectedStoreSlug: string
  categories: { name: string, slug: string, description: string }[]
  products: ProductView[]
  brands: string[]
  specials: SpecialView[]
  todaySpecial: SpecialView | null
  navCategories: { name: string, slug: string, description: string, count: number }[]
  navBrands: { name: string, count: number, query: string }[]
  navFeature: ProductView | null
  navProductCount: number
  navDeliveryMinimum: string
}

/**
 * Categories dosed in milligrams rather than as a percentage of mass.
 *
 * A gummy pack is "100mg", a tincture is "25mg" — an edible has no meaningful
 * "percent THC", because the number that matters is how much is in the piece
 * you eat, not what fraction of the gummy's weight it is. The catalogue keeps
 * both in one `thc_percentage` column, so the seeded 100 for a 20-pack was
 * rendering as "THC 100.0%", which reads as the most potent product on the
 * menu rather than five milligrams a piece.
 */
const MG_DOSED = new Set(['edibles', 'wellness'])

/** Potency as a customer reads it: a percentage, or milligrams. */
export function potency(value: unknown, category: string): string {
  const amount = Number(value)
  if (!amount)
    return ''

  return MG_DOSED.has(category)
    // Milligrams are whole numbers on a label; nobody prints 100.0mg.
    ? `${Number.isInteger(amount) ? amount : amount.toFixed(1)}mg`
    : `${amount.toFixed(1)}%`
}

/**
 * The potency line as a card prints it, or nothing at all.
 *
 * `potency` returns an empty string for a product with no lab figure, and the
 * three views that showed it each interpolated the value into their own
 * template around it. The menu rendered " THC" and the homepage and store
 * pages rendered "THC  · CBD " — a label with nothing to label, on every
 * product whose supplier had not sent numbers. Composing it here also settles
 * which way round it reads, which the three of them had disagreed about.
 */
export function potencyLabel(thc: string, cbd: string): string {
  return [thc && `${thc} THC`, cbd && `${cbd} CBD`].filter(Boolean).join(' · ')
}

/** JSON columns come back as text from SQLite and as arrays from Postgres. */
function jsonColumn(value: unknown): string[] {
  if (Array.isArray(value))
    return value as string[]
  try {
    return JSON.parse(String(value || '[]'))
  }
  catch {
    return []
  }
}

export async function loadStores(): Promise<StoreView[]> {
  const [rows, stocked] = await Promise.all([
    Store.where('is_active', true).orderBy('display_order', 'asc').get(),
    StoreProduct.where('is_available', true).get(),
  ])

  // A shop we have inventory for is a shop that can be ordered from. Derived
  // rather than configured, so a location becomes orderable the moment its
  // first import lands and nobody has to remember to flip a flag.
  const withStock = new Set((stocked as any[]).map(row => row.store_id))

  return rows.map((row: any) => ({
    name: row.name,
    slug: row.slug,
    shortName: row.short_name,
    address: `${row.address_line}, ${row.city} ${row.state} ${row.postal_code}`,
    addressLine: row.address_line,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    storePhone: row.store_phone,
    storePhoneHref: telHref(row.store_phone),
    deliveryPhone: row.delivery_phone,
    deliveryPhoneHref: telHref(row.delivery_phone),
    email: row.email,
    license: row.license_number,
    storeHours: row.store_hours,
    deliveryHours: row.delivery_hours,
    pickupHours: row.pickup_hours,
    amenities: jsonColumn(row.amenities),
    mapUrl: row.map_url,
    image: row.image_url,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    deliveryMinimum: money(row.delivery_minimum * 100),
    deliveryMinimumValue: Number(row.delivery_minimum),
    url: `/stores/${row.slug}`,
    ordersOnline: withStock.has(row.id),
  }))
}

/**
 * The catalog, joined into the shape a template can read.
 *
 * Categories and brands arrive as separate tables keyed by id, so both are
 * indexed once here rather than per product.
 */
export async function loadCatalog(storeSlug = ''): Promise<{
  categories: SiteModel['categories']
  products: ProductView[]
  brands: string[]
}> {
  const [categoryRows, brandRows, productRows, storeRows, stockRows] = await Promise.all([
    Category.where('is_active', true).orderBy('display_order', 'asc').get(),
    Manufacturer.query().get(),
    Product.where('is_available', true).orderBy('is_featured', 'desc').get(),
    Store.where('is_active', true).orderBy('display_order', 'asc').get(),
    StoreProduct.where('is_available', true).get(),
  ])

  /*
   * Which shops hold each product, and what each charges.
   *
   * Two maps rather than a join so the whole menu costs the five queries above
   * however many products it has. `stock` answers "who has it"; `priced`
   * answers "what does the shop the customer picked charge", which is a
   * separate question because tax is levied per storefront and a brand
   * discount routinely runs at one location and not the other.
   */
  const slugByStoreId = new Map(storeRows.map((row: any) => [row.id, row.slug]))
  const storeShortBySlug = new Map(storeRows.map((row: any) => [row.slug, row.short_name]))

  const stock = new Map<number, string[]>()
  const priced = new Map<number, any>()

  for (const row of stockRows as any[]) {
    const slug = slugByStoreId.get(row.store_id)
    if (!slug)
      continue

    stock.set(row.product_id, [...(stock.get(row.product_id) ?? []), slug])

    if (slug === storeSlug)
      priced.set(row.product_id, row)
  }

  const categorySlugById = new Map(categoryRows.map((row: any) => [row.id, row.slug]))
  const categoryNameBySlug = new Map(categoryRows.map((row: any) => [row.slug, row.name]))
  const brandNameById = new Map(brandRows.map((row: any) => [row.id, row.manufacturer]))

  const categories = categoryRows.map((row: any) => ({
    name: row.name,
    slug: row.slug,
    description: row.description,
  }))

  /*
   * Once any shop has reported its shelves, the menu is what the shops have.
   *
   * `seed:catalog` writes a small hand-built catalog so a fresh checkout has
   * something to render before `sync:menu` has ever run. Those rows have no
   * store inventory, and leaving them in alongside the imported menu put
   * twenty invented products on the page marked "Sold out here" — permanently,
   * since nothing upstream will ever stock them.
   *
   * So: if there is stock data, it decides the menu. If there is none, this is
   * a fresh install and the seeded rows are all there is.
   */
  const inventoryKnown = stockRows.length > 0
  const listed = inventoryKnown ? productRows.filter((row: any) => stock.has(row.id)) : productRows

  const products: ProductView[] = listed.map((row: any) => {
    const category = categorySlugById.get(row.category_id) || 'flower'
    const stockedAt = stock.get(row.id) ?? []

    // The selected shop's own price when it has one. Falling back to the
    // product row is what keeps a card renderable before the first import and
    // for anyone browsing without having picked a shop yet.
    const here = priced.get(row.id)
    const priceCents = here ? here.price : row.price
    const compareAt = here ? here.compare_at_price : row.compare_at_price

    const thcLabel = potency(row.thc_percentage, category)
    const cbdLabel = potency(row.cbd_percentage, category)

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description || '',
      category,
      categoryName: categoryNameBySlug.get(category) || 'Flower',
      brand: brandNameById.get(row.manufacturer_id) || '',
      brandLine: row.brand_line || '',
      strain: row.strain_type || '',
      unit: (here?.unit_size || row.unit_size) || '',
      priceCents,
      price: money(priceCents),
      wasPrice: compareAt > 0 ? money(compareAt) : '',
      thc: thcLabel,
      // Numeric and unformatted: the menu sorts on this, and sorting has to
      // stay within a category to mean anything anyway.
      thcValue: Number(row.thc_percentage || 0),
      cbd: cbdLabel,
      potencyLabel: potencyLabel(thcLabel, cbdLabel),
      image: row.image_url || '',
      /*
       * Derived at import by `menu:sync`, because a product photograph lives
       * on Jane's CDN and nothing in a build has ever opened it. See the note
       * in app/Integrations/Jane/placeholder.ts.
       */
      imagePlaceholder: row.image_placeholder || '',
      rating: row.rating ? Number(row.rating).toFixed(1) : '',
      reviews: Number(row.review_count || 0),
      /*
       * The cached columns on the product row, not a join. A menu of twenty
       * cards each showing a star line would otherwise be twenty-one queries,
       * and the cache is what `./buddy seed:reviews` refreshes.
       *
       * Both are empty when a product is unrated, so a card renders nothing
       * rather than "0.0 (0)", which reads as a bad score rather than no score.
       */
      ratingLabel: Number(row.rating) > 0 ? Number(row.rating).toFixed(1) : '',
      reviewsLabel: Number(row.review_count) > 0 ? `(${row.review_count})` : '',
      featured: row.is_featured ? 1 : 0,
      stockedAt,
      // With no shop chosen the menu is the union of both, so nothing reads as
      // sold out before the customer has told us where they are.
      inStockHere: storeSlug ? stockedAt.includes(storeSlug) : stockedAt.length > 0,
      alsoAt: stockedAt
        .filter(slug => slug !== storeSlug)
        .map(slug => storeShortBySlug.get(slug) || slug),
    }
  })

  return { categories, products, brands: brandRows.map((row: any) => row.manufacturer) }
}

/**
 * The weekday deal calendar, ordered Monday first and flagged with the day it
 * is *in Los Angeles*. Reading the server's clock would put an LA customer on
 * tomorrow's deal all evening if the box happens to run in Europe.
 */
export async function loadSpecials(stores: StoreView[]): Promise<SpecialView[]> {
  const rows = await Special.where('is_active', true).get()
  const laToday = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long' })
  const dayOrder = [1, 2, 3, 4, 5, 6, 0]

  return rows
    .slice()
    .sort((a: any, b: any) => dayOrder.indexOf(a.day_of_week) - dayOrder.indexOf(b.day_of_week))
    .map((row: any) => ({
      day: row.day_label,
      short: String(row.day_label).slice(0, 3),
      title: row.title,
      offer: row.offer,
      brands: jsonColumn(row.brands),
      storeOnly: row.store_slug
        ? (stores.find(store => store.slug === row.store_slug)?.shortName || '')
        : '',
      isToday: row.day_label === laToday,
    }))
}

/**
 * Everything the shared header and footer need, in one round of queries.
 *
 * Nav counts are real: a category with nothing in stock is dropped rather than
 * rendered as a dead link with a zero beside it.
 */
/** Cookie the chosen shop is remembered in. */
export const STORE_COOKIE = 'erba_store'

/**
 * What a template knows about the request.
 *
 * stx hands `<script server>` a `cookies` and a `query` object; it does not
 * hand it the `Request`, and the router's `request` proxy is empty during a
 * page render because pages are rendered by stx's server rather than through
 * the router. So the two values are passed in rather than reached for, which
 * also makes this callable from a test without a server.
 */
export interface RequestScope {
  cookies?: Record<string, string>
  query?: Record<string, string>
}

/**
 * Which shop the customer is ordering from.
 *
 * A cookie rather than the URL, so the choice survives every link on the site —
 * someone who picked Sawtelle on the menu should still be on Sawtelle after
 * reading the FAQ. `?store=` wins when present, which is what makes a shared
 * link land on the shop the sender meant.
 *
 * Returns `''` when nothing has been chosen. That is a real state, not a
 * missing one: until the customer says where they are, the menu shows
 * everything both shops carry and nothing is described as sold out.
 */
export function resolveStoreSlug(stores: StoreView[], scope: RequestScope = {}): string {
  const known = new Set(stores.map(store => store.slug))

  const asked = String(scope.query?.store ?? '')
  if (known.has(asked))
    return asked

  const chosen = String(scope.cookies?.[STORE_COOKIE] ?? '')
  return known.has(chosen) ? chosen : ''
}

export async function loadSiteModel(scope: RequestScope = {}): Promise<SiteModel> {
  const stores = await loadStores()
  const selectedStoreSlug = resolveStoreSlug(stores, scope)
  const catalog = await loadCatalog(selectedStoreSlug)
  const { categories, products, brands } = catalog
  const specials = await loadSpecials(stores)

  const countBy = (key: 'category' | 'brand') => products.reduce<Record<string, number>>((acc, product) => {
    acc[product[key]] = (acc[product[key]] || 0) + 1
    return acc
  }, {})

  const productsPerCategory = countBy('category')
  const navCategories = categories
    .map(category => ({ ...category, count: productsPerCategory[category.slug] ?? 0 }))
    .filter(category => category.count > 0)

  const productsPerBrand = countBy('brand')
  const navBrands = Object.entries(productsPerBrand)
    .filter(([name]) => name)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    // Encoded here rather than in the template: interpolation has no function
    // calls available to it.
    .map(([name, count]) => ({ name, count, query: encodeURIComponent(name) }))

  // The panel gives the feature a 4:3 frame, and an empty one looks broken.
  const navFeature = products.find(product => product.image) || null

  /*
   * Both rooms are seeded and both are active, so these always resolve. The
   * throw is for the case that is not supposed to happen - an empty or
   * unseeded `stores` table - because every page reads `westla.deliveryMinimum`
   * and `sawtelle.license`, and failing here with a sentence naming the cause
   * beats a hundred `undefined` reads in the markup.
   */
  const sawtelle = stores.find(store => store.slug === 'erba-sawtelle') ?? stores[0]
  const westla = stores.find(store => store.slug === 'erba-west-la') ?? stores.at(-1)

  if (!sawtelle || !westla)
    throw new Error('No active stores. Run `./buddy seed:catalog` — every page reads store hours, phone numbers and license numbers.')

  const selectedStore = stores.find(store => store.slug === selectedStoreSlug) ?? null

  return {
    stores,
    sawtelle,
    westla,
    selectedStore,
    selectedStoreSlug,
    categories,
    products,
    brands,
    specials,
    todaySpecial: specials.find(special => special.isToday) || null,
    navCategories,
    navBrands,
    navFeature,
    navProductCount: products.length,
    navDeliveryMinimum: westla.deliveryMinimum,
  }
}

/* ------------------------------------------------------------------------ *
 * Reviews
 * ------------------------------------------------------------------------ */

export interface ReviewView {
  id: number
  rating: number
  hasRating: boolean
  title: string
  content: string
  hasContent: boolean
  author: string
  verified: boolean
  date: string
  stars: { on: boolean }[]
  /** Pinned to the top of the list by the shop. */
  featured: boolean
  /** `24 found this helpful`, or empty when nobody has said so. */
  helpfulLabel: string
}

export interface ProductReviews {
  reviewStats: { total: number, rated: number, commentsOnly: number, average: number }
  reviews: ReviewView[]
  averageStars: { on: boolean }[]
  distribution: { star: number, count: number, width: string }[]
  reviewsLabel: string
}

/** Five booleans, because interpolation cannot call a function. */
function starRow(rating: number): { on: boolean }[] {
  const filled = Math.round(rating)
  return [1, 2, 3, 4, 5].map(star => ({ on: star <= filled }))
}

/** A product nobody has reviewed. Same shape, so the template never branches. */
export function emptyProductReviews(): ProductReviews {
  return {
    reviewStats: { total: 0, rated: 0, commentsOnly: 0, average: 0 },
    reviews: [],
    averageStars: starRow(0),
    distribution: [5, 4, 3, 2, 1].map(star => ({ star, count: 0, width: '0%' })),
    reviewsLabel: 'No reviews yet',
  }
}

/**
 * Everything a product page prints about what people thought of it.
 *
 * Built on `commerce.products.reviews` rather than querying the table here:
 * `fetchStats` already knows the rule that is easy to get wrong, which is that
 * a review with no star is counted in the total but left out of the average.
 * Averaging it in as a zero would punish someone for writing two paragraphs
 * without picking a number.
 *
 * Only approved reviews are read. A newly submitted one is waiting on a human,
 * and showing it would be publishing on their behalf.
 */
export async function loadProductReviews(productId: number): Promise<ProductReviews> {
  const [stats, rows] = await Promise.all([
    commerce.products.reviews.fetchStats(productId),
    commerce.products.reviews.fetchApprovedByProductId(productId),
  ])

  // Reviewer names in one query rather than one per review.
  const customerIds = [...new Set(rows.map((row: any) => row.customer_id).filter(Boolean))]
  const customers = customerIds.length ? await Customer.whereIn('id', customerIds).get() : []
  const nameById = new Map(customers.map((row: any) => [row.id, row.name]))

  const reviews: ReviewView[] = rows
    .slice()
    /*
     * Featured first, then newest.
     *
     * `is_featured` is the shop pinning a review it wants read first, so it
     * outranks recency; within each group the newest wins, because on a
     * product that has been on the shelf a year the useful review is the one
     * describing the batch currently in the jar.
     */
    .sort((a: any, b: any) => {
      const pinned = Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured))
      if (pinned !== 0)
        return pinned

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    .map((row: any) => {
      const hasRating = row.rating !== null && row.rating !== undefined
      const rating = hasRating ? Number(row.rating) : 0
      const content = row.content || ''
      const title = row.title || ''

      return {
        id: row.id,
        rating,
        hasRating,
        title,
        content,
        hasContent: Boolean(title || content),
        author: nameById.get(row.customer_id) || 'ERBA customer',
        verified: Boolean(row.is_verified_purchase),
        date: row.created_at
          ? new Date(row.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          : '',
        stars: starRow(rating),
        featured: Boolean(row.is_featured),
        /*
         * Read-only. The count is worth showing - it is how a reader decides
         * which of forty reviews to read - but voting is a separate feature
         * with its own abuse surface, and `commerce.products.reviews.updateVotes`
         * is where it would go when someone wants it.
         */
        helpfulLabel: Number(row.helpful_votes) > 0
          ? `${row.helpful_votes} found this helpful`
          : '',
      }
    })

  /*
   * Bars are scaled against the most-used rating rather than the total, so the
   * longest one fills its row and the shape stays legible on a product with
   * six reviews as well as one with six hundred.
   */
  const peak = Math.max(1, ...[5, 4, 3, 2, 1].map(star => stats.distribution[star as 1 | 2 | 3 | 4 | 5]))

  return {
    reviewStats: {
      total: stats.total,
      rated: stats.rated,
      commentsOnly: stats.commentsOnly,
      average: stats.average,
    },
    reviews,
    averageStars: starRow(stats.average),
    distribution: [5, 4, 3, 2, 1].map((star) => {
      const count = stats.distribution[star as 1 | 2 | 3 | 4 | 5]
      return { star, count, width: `${Math.round((count / peak) * 100)}%` }
    }),
    reviewsLabel: stats.total === 1 ? '1 review' : `${stats.total} reviews`,
  }
}
