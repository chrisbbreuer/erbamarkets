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
import Product from '../../app/Models/Product'
import Special from '../../app/Models/Special'
import Store from '../../app/Models/Store'
import Category from '../../storage/framework/defaults/app/Models/commerce/Category'
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
  image: string
  rating: string
  reviews: number
  featured: number
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
  const rows = await Store.where('is_active', true).orderBy('display_order', 'asc').get()

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
  }))
}

/**
 * The catalog, joined into the shape a template can read.
 *
 * Categories and brands arrive as separate tables keyed by id, so both are
 * indexed once here rather than per product.
 */
export async function loadCatalog(): Promise<{
  categories: SiteModel['categories']
  products: ProductView[]
  brands: string[]
}> {
  const [categoryRows, brandRows, productRows] = await Promise.all([
    Category.where('is_active', true).orderBy('display_order', 'asc').get(),
    Manufacturer.query().get(),
    Product.where('is_available', true).orderBy('is_featured', 'desc').get(),
  ])

  const categorySlugById = new Map(categoryRows.map((row: any) => [row.id, row.slug]))
  const categoryNameBySlug = new Map(categoryRows.map((row: any) => [row.slug, row.name]))
  const brandNameById = new Map(brandRows.map((row: any) => [row.id, row.manufacturer]))

  const categories = categoryRows.map((row: any) => ({
    name: row.name,
    slug: row.slug,
    description: row.description,
  }))

  const products: ProductView[] = productRows.map((row: any) => {
    const category = categorySlugById.get(row.category_id) || 'flower'

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
      unit: row.unit_size || '',
      priceCents: row.price,
      price: money(row.price),
      wasPrice: row.compare_at_price > 0 ? money(row.compare_at_price) : '',
      thc: row.thc_percentage ? `${Number(row.thc_percentage).toFixed(1)}%` : '',
      thcValue: Number(row.thc_percentage || 0),
      cbd: row.cbd_percentage ? `${Number(row.cbd_percentage).toFixed(1)}%` : '',
      image: row.image_url || '',
      rating: row.rating ? Number(row.rating).toFixed(1) : '',
      reviews: Number(row.review_count || 0),
      featured: row.is_featured ? 1 : 0,
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
export async function loadSiteModel(): Promise<SiteModel> {
  const [stores, catalog] = await Promise.all([loadStores(), loadCatalog()])
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

  return {
    stores,
    sawtelle,
    westla,
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
