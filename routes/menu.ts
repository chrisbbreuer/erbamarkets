import { log } from '@stacksjs/logging'
import { response, route } from '@stacksjs/router'
import { useTypesense } from '@stacksjs/search-engine'
import { potency } from '../resources/functions/site'
import Product from '../app/Models/Product'
import Category from '../storage/framework/defaults/app/Models/commerce/Category'
import Manufacturer from '../storage/framework/defaults/app/Models/commerce/Manufacturer'

/**
 * Menu search.
 *
 * The engine is Typesense, which the deployed box already runs through pantry.
 * It is what makes a misspelled brand still find the brand, which a LIKE query
 * cannot do.
 *
 * It is also a separate process that can be down, mid-restart, or simply not
 * indexed yet on a fresh checkout. A dispensary menu that returns nothing in
 * that case is worse than one that returns slower, so every path falls back to
 * querying the database and the response says which engine answered. The page
 * shows that, rather than pretending the fallback is the same thing.
 *
 * Registered under `/api` by app/Routes.ts, so this is `/api/menu/search`.
 */

const MENU_INDEX = 'erba_products'

/** Ordering the UI offers, mapped to how each backend expresses it. */
const SORTS: Record<string, { engine: Record<string, string>, column: [string, 'asc' | 'desc'] }> = {
  'featured': { engine: { featured: 'desc' }, column: ['is_featured', 'desc'] },
  'price-asc': { engine: { price: 'asc' }, column: ['price', 'asc'] },
  'price-desc': { engine: { price: 'desc' }, column: ['price', 'desc'] },
  'thc-desc': { engine: { thc: 'desc' }, column: ['thc_percentage', 'desc'] },
  'rating-desc': { engine: { rating: 'desc' }, column: ['rating', 'desc'] },
}

interface MenuHit {
  id: string
  name: string
  slug: string
  category: string
  brand: string
  strain: string
  unit: string
  price: number
  thc: number
  rating: number
  image: string
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`
}

/** Adds the display fields the table renders, so the client formats nothing. */
function decorate(hit: MenuHit): Record<string, unknown> {
  return {
    ...hit,
    priceLabel: money(Number(hit.price) || 0),
    // Shared with the server-rendered menu, so a gummy found through search
    // reads "100mg" here too rather than the "100.0%" a bare percentage gives.
    thcLabel: potency(hit.thc, hit.category),
    ratingLabel: hit.rating ? Number(hit.rating).toFixed(1) : '',
  }
}

async function searchViaEngine(params: {
  query: string
  category: string
  brand: string
  strain: string
  sort: string
  perPage: number
}): Promise<MenuHit[]> {
  const engine = await useTypesense()

  // Only non-empty facets, so an unset dropdown does not filter to nothing.
  const filter: Record<string, string> = {}
  if (params.category) filter.category = params.category
  if (params.brand) filter.brand = params.brand
  if (params.strain) filter.strain = params.strain

  const result = await engine.search(MENU_INDEX, {
    query: params.query,
    queryBy: ['name', 'brand', 'description', 'strain', 'category'],
    filter: Object.keys(filter).length ? filter : undefined,
    sort: SORTS[params.sort]?.engine,
    perPage: params.perPage,
  })

  return (result.hits ?? []) as unknown as MenuHit[]
}

/**
 * The same query against the database. Substring matching only: this is the
 * degraded path, and it is honest about being one.
 */
async function searchViaDatabase(params: {
  query: string
  category: string
  brand: string
  strain: string
  sort: string
  perPage: number
}): Promise<MenuHit[]> {
  const [categories, brands] = await Promise.all([
    Category.query().get(),
    Manufacturer.query().get(),
  ])

  const categoryById = new Map(categories.map((row: any) => [row.id, row.slug]))
  const brandById = new Map(brands.map((row: any) => [row.id, row.manufacturer]))

  const [column, direction] = SORTS[params.sort]?.column ?? SORTS.featured.column
  const rows = await Product.where('is_available', true).orderBy(column, direction).get()

  const term = params.query.trim().toLowerCase()

  return rows
    .map((row: any) => ({
      id: String(row.id),
      name: row.name ?? '',
      slug: row.slug ?? '',
      description: row.description ?? '',
      category: categoryById.get(row.category_id) ?? 'flower',
      brand: brandById.get(row.manufacturer_id) ?? '',
      strain: row.strain_type ?? '',
      unit: row.unit_size ?? '',
      price: Number(row.price ?? 0),
      thc: Number(row.thc_percentage ?? 0),
      rating: Number(row.rating ?? 0),
      image: row.image_url ?? '',
    }))
    .filter((hit: any) => {
      if (params.category && hit.category !== params.category) return false
      if (params.brand && hit.brand !== params.brand) return false
      if (params.strain && hit.strain !== params.strain) return false
      if (!term) return true
      return [hit.name, hit.brand, hit.description, hit.strain, hit.category]
        .some(field => String(field).toLowerCase().includes(term))
    })
    .slice(0, params.perPage)
}

route.get('/menu/search', async (request: any) => {
  const params = {
    query: String(request.get?.('q') ?? request.query?.q ?? ''),
    category: String(request.get?.('category') ?? request.query?.category ?? ''),
    brand: String(request.get?.('brand') ?? request.query?.brand ?? ''),
    strain: String(request.get?.('strain') ?? request.query?.strain ?? ''),
    sort: String(request.get?.('sort') ?? request.query?.sort ?? 'featured'),
    perPage: Math.min(Number(request.get?.('perPage') ?? request.query?.perPage ?? 100) || 100, 250),
  }

  try {
    const hits = await searchViaEngine(params)
    return response.json({
      engine: 'typesense',
      total: hits.length,
      results: hits.map(decorate),
    })
  }
  catch (error) {
    // Down, unreachable, or never indexed. Answer from the database instead of
    // handing the shop an empty menu, and say so in the payload.
    log.warn(`[menu/search] Typesense unavailable, falling back to the database: ${(error as Error).message}`)

    const hits = await searchViaDatabase(params)
    return response.json({
      engine: 'database',
      total: hits.length,
      results: hits.map(decorate),
    })
  }
})
