import type { CLI } from '@stacksjs/types'
import process from 'node:process'
import { log } from '@stacksjs/cli'
import { useTypesense } from '@stacksjs/search-engine'
import { ExitCode } from '@stacksjs/types'
// Models are auto-imported as server globals in routes, actions and jobs, but
// not in a buddy command, so they are imported the way the framework's own
// code does it.
import Category from '../../storage/framework/defaults/app/Models/commerce/Category'
import Manufacturer from '../../storage/framework/defaults/app/Models/commerce/Manufacturer'
import Product from '../Models/Product'

/**
 * Push the menu into Typesense.
 *
 * The deployed box already runs Typesense through pantry, so this is the step
 * that makes the search box on /menu use it rather than a LIKE query. Run it
 * after `seed:catalog`, and again whenever the menu changes.
 *
 * The collection is dropped and rebuilt rather than diffed. The catalog is a
 * few hundred rows at most, a rebuild takes under a second, and it means a
 * product pulled from the menu cannot linger in the index as a search result
 * for something the shop can no longer sell.
 */

/** Matches the collection the search route queries. */
export const MENU_INDEX = 'erba_products'

export interface MenuDocument {
  id: string
  name: string
  slug: string
  description: string
  category: string
  brand: string
  strain: string
  unit: string
  /** Cents, so sorting is integer comparison and never float drift. */
  price: number
  thc: number
  rating: number
  image: string
  featured: number
}

export async function buildMenuDocuments(): Promise<MenuDocument[]> {
  const [products, categories, brands] = await Promise.all([
    Product.where('is_available', true).get(),
    Category.query().get(),
    Manufacturer.query().get(),
  ])

  const categoryById = new Map(categories.map((row: any) => [row.id, row.slug]))
  const brandById = new Map(brands.map((row: any) => [row.id, row.manufacturer]))

  return products.map((row: any) => ({
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
    featured: row.is_featured ? 1 : 0,
  }))
}

export async function indexMenu(): Promise<number> {
  const documents = await buildMenuDocuments()
  if (!documents.length)
    return 0

  const engine = await useTypesense()

  // Drop first so a removed product cannot survive as a stale hit. A missing
  // collection is the normal first-run case, not a failure.
  try {
    await engine.deleteIndex(MENU_INDEX)
  }
  catch {
    /* not there yet */
  }

  // The sample document types each field, so price and thc land as numbers
  // and sort numerically rather than as text.
  await engine.createIndex(MENU_INDEX, {
    settings: {
      searchableAttributes: ['name', 'brand', 'description', 'strain', 'category'],
      filterableAttributes: ['category', 'brand', 'strain'],
      sortableAttributes: ['price', 'thc', 'rating', 'featured'],
      displayedAttributes: Object.keys(documents[0]),
    },
    sampleDocument: documents[0] as unknown as Record<string, unknown>,
  })

  await engine.addDocuments(MENU_INDEX, documents as any)

  return documents.length
}

export default function (cli: CLI): void {
  cli
    .command('menu:index', 'Push the ERBA menu into Typesense so /menu search uses the engine')
    .option('--verbose', 'Print each document as it is indexed', { default: false })
    .action(async (options: { verbose?: boolean }) => {
      try {
        log.info('Building menu documents...')
        const documents = await buildMenuDocuments()

        if (!documents.length) {
          log.warn('No available products to index. Run `./buddy seed:catalog` first.')
          process.exit(ExitCode.Success)
        }

        if (options.verbose) {
          for (const doc of documents)
            log.info(`  ${doc.name}, ${doc.brand} (${doc.category})`)
        }

        const count = await indexMenu()
        log.success(`Indexed ${count} products into '${MENU_INDEX}'`)
      }
      catch (error) {
        log.error('Could not index the menu. Is Typesense running? `pantry start typesense`')
        console.error(error)
        process.exit(ExitCode.FatalError)
      }

      process.exit(ExitCode.Success)
    })
}
