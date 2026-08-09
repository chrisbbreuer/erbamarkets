import type { CLI } from '@stacksjs/types'
import type { JaneProduct } from '../Integrations/Jane/client'
import process from 'node:process'
import { log } from '@stacksjs/cli'
import { slug as slugify } from '@stacksjs/strings'
import { ExitCode } from '@stacksjs/types'
import menu from '../../config/menu'
import { fetchProduct, fulfillmentOf, productUrls } from '../Integrations/Jane/client'
// Models are auto-imported as server globals in routes, actions and jobs, but
// not in a buddy command, so they are imported the way the framework's own
// code does it.
import Category from '../../storage/framework/defaults/app/Models/commerce/Category'
import Manufacturer from '../../storage/framework/defaults/app/Models/commerce/Manufacturer'
import Product from '../Models/Product'
import Store from '../Models/Store'
import StoreProduct from '../Models/StoreProduct'

/**
 * Pull the real menu in from Jane.
 *
 * This is what makes our catalog the shop's catalog rather than a plausible
 * imitation of one. Everything a customer reads on the menu — what is stocked,
 * what it costs today, what came off the shelf this morning — is decided by the
 * point of sale, and this is the only path from there to here.
 *
 * Written to be run repeatedly, on a schedule. It upserts on the pair
 * (store, upstream product id), so a rerun corrects prices and stock rather
 * than duplicating rows, and a product that has left the menu is marked
 * unavailable rather than deleted: an order references it, and a customer
 * following an old link should get "we no longer carry this" instead of a 404.
 *
 * Nothing on the storefront calls Jane. The site reads our database, so an
 * outage upstream costs us freshness and nothing else.
 */

interface SyncOptions {
  /** Import only this many products. For checking a change quickly. */
  limit?: number
  /** Report what would change without writing. */
  dryRun?: boolean
}

/**
 * Jane's product kinds, mapped onto the categories the menu is organised by.
 *
 * Jane splits `vape` from `extract` and lumps tinctures with topicals under
 * separate kinds; ERBA's menu has always shown Cartridges and Concentrates as
 * separate aisles, with tinctures and topicals together under Wellness. Naming
 * the mapping keeps that a decision rather than an accident of whichever
 * vocabulary won.
 */
const CATEGORY_BY_KIND: Record<string, string> = {
  'flower': 'flower',
  'vape': 'cartridges',
  'cartridge': 'cartridges',
  'edible': 'edibles',
  'pre-roll': 'pre-rolls',
  'preroll': 'pre-rolls',
  'extract': 'concentrates',
  'concentrate': 'concentrates',
  'tincture': 'wellness',
  'topical': 'wellness',
  'gear': 'gear',
}

/** Categories the importer may create when Jane sends a kind we have no aisle for. */
const CATEGORY_NAMES: Record<string, string> = {
  'flower': 'Flower',
  'cartridges': 'Cartridges',
  'edibles': 'Edibles',
  'pre-rolls': 'Pre-Rolls',
  'concentrates': 'Concentrates',
  'wellness': 'Wellness',
  'gear': 'Gear',
}

const STRAIN_TYPES = new Set(['indica', 'sativa', 'hybrid', 'cbd'])

/** Jane's lineage vocabulary, narrowed to what `Product.strainType` accepts. */
function strainType(lineage: string): string {
  const value = lineage.toLowerCase()

  if (STRAIN_TYPES.has(value))
    return value

  // Jane also emits "cbd_dominant", "high_cbd" and, for anything without a
  // lineage at all, the empty string. Hybrid is the honest default: it is what
  // the shop's own labels say when a strain has not been characterised.
  return value.includes('cbd') ? 'cbd' : 'hybrid'
}

async function categoryIdFor(kind: string, cache: Map<string, number>): Promise<number | undefined> {
  const categorySlug = CATEGORY_BY_KIND[kind.toLowerCase()] ?? 'gear'

  if (cache.has(categorySlug))
    return cache.get(categorySlug)

  const existing = await Category.where('slug', categorySlug).first()

  const row = existing ?? await Category.create({
    name: CATEGORY_NAMES[categorySlug] ?? categorySlug,
    slug: categorySlug,
    description: '',
    displayOrder: 99,
    isActive: true,
  })

  cache.set(categorySlug, row.id)
  return row.id
}

async function manufacturerIdFor(brand: string, cache: Map<string, number>): Promise<number | undefined> {
  if (!brand)
    return undefined

  if (cache.has(brand))
    return cache.get(brand)

  // The framework's Manufacturer names the brand in `manufacturer`, not `name`,
  // and carries no slug — so the name is the key.
  const existing = await Manufacturer.where('manufacturer', brand).first()

  const row = existing ?? await Manufacturer.create({
    manufacturer: brand,
    description: '',
    country: 'United States',
    featured: false,
  })

  cache.set(brand, row.id)
  return row.id
}

/**
 * Write the product itself — the facts that hold wherever it is sold.
 *
 * Price and stock are deliberately absent: those belong to `StoreProduct`,
 * because they differ by shop. `Product.price` is kept in step with the
 * cheapest store carrying it, purely so the framework's own commerce views and
 * the search index have a number to sort on.
 */
async function upsertProduct(
  item: JaneProduct,
  caches: { category: Map<string, number>, manufacturer: Map<string, number> },
): Promise<number> {
  const attributes = {
    name: item.name,
    description: item.description,
    price: item.price,
    compareAtPrice: item.compareAtPrice,
    unitSize: item.unitSize,
    strainType: strainType(item.lineage),
    thcPercentage: item.thc,
    cbdPercentage: item.cbd,
    brandLine: item.brandLine,
    imageUrl: item.imageUrl,
    rating: item.rating,
    categoryId: await categoryIdFor(item.kind, caches.category),
    manufacturerId: await manufacturerIdFor(item.brand, caches.manufacturer),
    isAvailable: true,
  }

  const existing = await Product.where('slug', item.slug).first()

  if (existing) {
    await Product.update(existing.id, attributes)
    return existing.id
  }

  const created = await Product.create({ ...attributes, slug: item.slug })
  return created.id
}

/** Write what this shop charges and whether it has any. */
async function upsertStoreProduct(storeId: number, productId: number, item: JaneProduct, dryRun: boolean): Promise<'created' | 'updated'> {
  const attributes = {
    storeId,
    productId,
    price: item.price,
    compareAtPrice: item.compareAtPrice,
    unitSize: item.unitSize,
    isAvailable: item.inStock,
    // Jane reports availability, not counts. -1 says so, rather than implying
    // a shelf we cannot see.
    stockCount: -1,
    fulfillment: fulfillmentOf(item),
    sourceId: String(item.productId),
    syncedAt: new Date().toISOString(),
  }

  const existing = await StoreProduct.where('store_id', storeId).where('source_id', String(item.productId)).first()

  if (dryRun)
    return existing ? 'updated' : 'created'

  if (existing) {
    await StoreProduct.update(existing.id, attributes)
    return 'updated'
  }

  await StoreProduct.create(attributes)
  return 'created'
}

/** Split `items` into consecutive runs of at most `size`. */
function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = []

  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))

  return out
}

export async function syncMenu(options: SyncOptions = {}): Promise<void> {
  for (const missing of menu.withoutOnlineMenu) {
    // Said on every run, because it is the reason one of two shops cannot be
    // ordered from, and it is invisible from the storefront.
    log.warn(`${missing} has no upstream menu configured — it will show as pickup-only with no stock.`)
  }

  const urls = await productUrls()
  const selected = options.limit ? urls.slice(0, options.limit) : urls

  log.info(`${urls.length} product URLs published upstream${options.limit ? `, importing ${selected.length}` : ''}`)

  const caches = { category: new Map<string, number>(), manufacturer: new Map<string, number>() }

  for (const source of menu.sources) {
    const store = await Store.where('slug', source.store).first()

    if (!store) {
      log.error(`config/menu.ts points at store "${source.store}", which does not exist. Run \`buddy seed:catalog\` first.`)
      continue
    }

    const seen = new Set<string>()
    let created = 0
    let updated = 0
    let skipped = 0
    let failed = 0

    /*
     * Fetch concurrently, write serially, a batch at a time.
     *
     * The two halves want opposite things. Six requests in flight turns a
     * twenty-minute crawl into four, and upstream is unbothered. The writes
     * must not overlap at all: several products share a brand and a category,
     * so concurrent workers race to create the same Manufacturer row and
     * whichever loses fails the unique index — silently, because each worker
     * catches its own error. A first run reported "4 failed" out of eight that
     * had fetched cleanly on their own.
     *
     * Interleaved rather than fetch-everything-then-write, so memory stays
     * flat and a run that is killed halfway has still imported half the menu
     * rather than nothing.
     */
    for (const batch of batches(selected, 6)) {
      const fetched = await Promise.all(batch.map(async (path) => {
        try {
          const item = await fetchProduct(path, source.janeStoreId)

          if (menu.requestDelay)
            await new Promise(resolve => setTimeout(resolve, menu.requestDelay * 1000))

          return { path, item, error: null as Error | null }
        }
        catch (error) {
          return { path, item: null, error: error as Error }
        }
      }))

          for (const { path, item, error } of fetched) {
      if (error) {
        failed++
        log.debug(`${path}: ${error.message}`)
        continue
      }

      // Most of the sitemap is products the shop has carried at some point and
      // does not now. Not an error, and not worth a line each.
      if (!item || !item.inStock) {
        skipped++
        continue
      }

      /*
       * One product, however many URLs point at it.
       *
       * The sitemap carries 1276 URLs for 1259 products: a renamed item keeps
       * its old slug alive so existing links do not 404. Importing both spellings
       * creates two Product rows for one item, and since StoreProduct is keyed on
       * the upstream id the second row ends up with no inventory attached to it —
       * a duplicate that can never be stocked. Eleven of those on the first run.
       */
      if (seen.has(String(item.productId))) {
        skipped++
        continue
      }

      seen.add(String(item.productId))

      if (options.dryRun) {
        created++
        continue
      }

      try {
        const productId = await upsertProduct(item, caches)
        const outcome = await upsertStoreProduct(store.id, productId, item, false)
        outcome === 'created' ? created++ : updated++
      }
      catch (writeError) {
        failed++
        log.debug(`${path}: ${(writeError as Error).message}`)
      }
      }
    }

    // Anything we hold for this store that upstream no longer lists came off
    // the shelf between runs. Marked unavailable, never deleted: orders
    // reference these rows, and a stale link should say "no longer carried"
    // rather than 404.
    let retired = 0

    if (!options.dryRun && !options.limit && seen.size) {
      const held = await StoreProduct.where('store_id', store.id).where('is_available', true).get()

      for (const row of held) {
        if (seen.has(String(row.source_id)))
          continue

        await StoreProduct.update(row.id, { isAvailable: false, syncedAt: new Date().toISOString() })
        retired++
      }
    }

    log.success(
      `${source.store} (${source.licence}): ${created} new, ${updated} updated, ${retired} retired, `
      + `${skipped} not carried${failed ? `, ${failed} failed` : ''}`,
    )
  }
}

export default function (buddy: CLI): void {
  buddy
    .command('sync:menu', 'Import the live menu from the point of sale into the catalog')
    .option('--limit <count>', 'Import only the first N products', { default: 0 })
    .option('--dry-run', 'Report what would change without writing', { default: false })
    .action(async (options: { limit?: string | number, dryRun?: boolean }) => {
      const limit = Number(options.limit) || undefined

      try {
        await syncMenu({ limit, dryRun: options.dryRun })
      }
      catch (error) {
        log.error('Menu sync failed', error)
        process.exit(ExitCode.FatalError)
      }

      // Flushes first. A plain `process.exit` here dropped every line the run
      // had just written, including the counts.
      await log.exit()
    })
}
