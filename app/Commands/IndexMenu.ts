import type { CLI } from '@stacksjs/types'
import process from 'node:process'
import { log } from '@stacksjs/cli'
import { useTypesense } from '@stacksjs/search-engine'
import { ExitCode } from '@stacksjs/types'
import { loadCatalog } from '../../resources/functions/site'

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

/**
 * The documents the search box will match against.
 *
 * Built from `loadCatalog`, the same call the menu page renders from, so the
 * index and the page cannot disagree about what is on sale. They did: the page
 * learned to hide products no shop stocks and the index kept its own query, so
 * searching turned up twenty hand-seeded items that were nowhere on the menu.
 *
 * Indexed without a store, which makes it the union of both shops. Search
 * answers "do we sell this", and the card the customer lands on answers "at
 * which counter" — narrowing the index per store would mean two collections
 * and a search that goes quiet the moment someone switches shops.
 */
export async function buildMenuDocuments(): Promise<MenuDocument[]> {
  const { products } = await loadCatalog()

  return products.map(product => ({
    id: String(product.id),
    name: product.name,
    slug: product.slug,
    description: product.description,
    category: product.category,
    brand: product.brand,
    strain: product.strain,
    unit: product.unit,
    price: product.priceCents,
    thc: product.thcValue,
    rating: Number(product.rating || 0),
    image: product.image,
    featured: product.featured,
  }))
}

export async function indexMenu(): Promise<number> {
  const documents = await buildMenuDocuments()
  // Destructured rather than length-checked so the sample below is a value
  // TypeScript knows is present, not one it has to be told about twice.
  const [sample] = documents
  if (!sample)
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
      displayedAttributes: Object.keys(sample),
    },
    sampleDocument: sample as unknown as Record<string, unknown>,
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

        // `log.exit`, not `log.success` then `process.exit`: the logger writes
        // asynchronously and the exit does not wait, so the count — the whole
        // point of running this — never reached the terminal.
        await log.exit(`Indexed ${count} products into '${MENU_INDEX}'`)
      }
      catch (error) {
        log.error('Could not index the menu. Is Typesense running? `pantry start typesense`')
        console.error(error)
        process.exit(ExitCode.FatalError)
      }

      process.exit(ExitCode.Success)
    })
}
