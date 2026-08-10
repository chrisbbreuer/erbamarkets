import type { CLI } from '@stacksjs/types'
import process from 'node:process'
import { log } from '@stacksjs/cli'
import { ExitCode } from '@stacksjs/types'
// Models are auto-imported as server globals in routes, actions and jobs, but
// not in a buddy command, so they are imported the way the framework's own
// code does it.
import Category from '../../storage/framework/defaults/app/Models/commerce/Category'
import Manufacturer from '../../storage/framework/defaults/app/Models/commerce/Manufacturer'
import Product from '../Models/Product'
import Special from '../Models/Special'
import Store from '../Models/Store'
import TaxRate from '../../storage/framework/defaults/app/Models/commerce/TaxRate'
import taxConfig from '../../config/tax'

/**
 * Loads the real storefront: two dispensaries, the weekday deal calendar, the
 * brands ERBA carries, the menu categories, and the menu itself.
 *
 * `./buddy seed` only knows how to generate rows from a model's `factory`,
 * which is the right tool for volume and the wrong one for content a customer
 * reads. Addresses, license numbers and deal copy have to be exact, so they
 * live here and get upserted by slug: re-running is safe and picks up edits.
 */

interface SeedOptions {
  fresh?: boolean
}

const STORES = [
  {
    name: 'ERBA Sawtelle',
    slug: 'erba-sawtelle',
    shortName: 'Sawtelle',
    addressLine: '2304 Sawtelle Blvd',
    city: 'Los Angeles',
    state: 'CA',
    postalCode: '90064',
    storePhone: '310-616-5140',
    deliveryPhone: '310-616-5140',
    email: 'delivery@erbasawtelle.com',
    licenseNumber: 'C10-0000626-LIC',
    storeHours: '8AM - 10PM',
    deliveryHours: '10AM - 8PM',
    pickupHours: 'Coming soon',
    amenities: ['Delivery', 'In-Store Shopping', 'ATM', 'Off-Street Parking', 'Valet'],
    latitude: 34.0361,
    longitude: -118.4453,
    mapUrl: 'https://maps.app.goo.gl/Szvf1TP2Wh5iaHkQ9',
    imageUrl: '/images/erba/sawtelle-entrance.jpg',
    deliveryMinimum: 30,
    displayOrder: 1,
  },
  {
    name: 'ERBA West LA',
    slug: 'erba-west-la',
    shortName: 'West LA',
    addressLine: '12320 W Pico Blvd',
    city: 'Los Angeles',
    state: 'CA',
    postalCode: '90064',
    storePhone: '310-207-1900',
    deliveryPhone: '310-207-0997',
    email: 'delivery@erbamarkets.com',
    licenseNumber: 'C10-0000383-LIC',
    storeHours: '8AM - 9:50PM',
    deliveryHours: '9AM - 9PM',
    pickupHours: '9AM - 9:50PM',
    amenities: ['Delivery', 'In-Store Shopping', 'Curbside Pickup', 'ATM', 'Off-Street Parking'],
    // Geocoded from the street address rather than eyeballed off a map.
    latitude: 34.028605,
    longitude: -118.451568,
    mapUrl: 'https://maps.app.goo.gl/8kK1sQ6yQ8bqoUeq7',
    imageUrl: '/images/erba/sawtelle-outside.jpg',
    deliveryMinimum: 30,
    displayOrder: 2,
  },
]

const SPECIALS = [
  {
    dayOfWeek: 1,
    dayLabel: 'Monday',
    title: 'Monday Munchies',
    offer: 'Buy an edible, get the second one half off',
    brands: ['Kiva', 'Terra Bites', 'Petra Mints', 'Lost Farm', 'Camino', 'Wyld', 'Smokiez'],
  },
  {
    dayOfWeek: 2,
    dayLabel: 'Tuesday',
    title: 'Tank Tuesday',
    offer: '30% off cartridges and disposables',
    brands: ['STIIIZY', '22Red', 'PAX', 'Heavy Hitters', 'Jetty', 'Claybourne'],
  },
  {
    dayOfWeek: 3,
    dayLabel: 'Wednesday',
    title: 'Wax and Wellness',
    offer: '30% off wellness and concentrates',
    brands: ['Papa & Barkley', 'LEVEL', 'Buddies', 'ABX', 'Care By Design'],
  },
  {
    dayOfWeek: 4,
    dayLabel: 'Thursday',
    title: 'Twist Up Thursday',
    offer: '30% off flower and prerolls',
    brands: ['Maven', 'CBX', 'Alien Labs', 'Connected', 'Pacific Stone', 'ERBA Flower'],
  },
  {
    dayOfWeek: 5,
    dayLabel: 'Friday',
    title: 'Fresh Fruit Cup Friday',
    offer: 'Complimentary fruit cup with any purchase, 12PM to 8PM at Sawtelle. Plus 30% off featured flower',
    brands: ['Maven', 'ERBA Flower', 'Rove'],
    storeSlug: 'erba-sawtelle',
  },
  {
    dayOfWeek: 6,
    dayLabel: 'Saturday',
    title: 'Silly Saturday',
    offer: '30% off featured brands',
    brands: ['Sluggerz', 'Gramlin', 'STIIIZY', 'Sauce', 'Dee Thai', 'Clsics', 'ERBA Flower'],
  },
  {
    dayOfWeek: 0,
    dayLabel: 'Sunday',
    title: 'Sunday Funday',
    offer: '30% off featured brands',
    brands: ['Sluggerz', 'STIIIZY', 'Sauce', 'Dee Thai', 'Clsics', 'Seed Junky'],
  },
]

const CATEGORIES = [
  { name: 'Flower', slug: 'flower', description: 'Indoor, sun grown and top shelf, by the eighth or the gram.', displayOrder: 1 },
  { name: 'Cartridges', slug: 'cartridges', description: 'Pods, 510 carts and all-in-one disposables.', displayOrder: 2 },
  { name: 'Edibles', slug: 'edibles', description: 'Gummies, chews, mints and drinks, dosed and labeled.', displayOrder: 3 },
  { name: 'Pre-Rolls', slug: 'pre-rolls', description: 'Singles, multi-packs and infused.', displayOrder: 4 },
  { name: 'Concentrates', slug: 'concentrates', description: 'Live resin, rosin, badder and hash.', displayOrder: 5 },
  { name: 'Wellness', slug: 'wellness', description: 'Tinctures, topicals and high-CBD ratios.', displayOrder: 6 },
]

/**
 * The framework's Manufacturer model names the brand in a `manufacturer`
 * column rather than `name`, and carries no slug, so rows are keyed on the
 * brand name itself.
 */
const MANUFACTURERS = [
  { manufacturer: 'STIIIZY', description: 'Pods, liquid diamonds and white label flower.', country: 'United States', featured: true },
  { manufacturer: 'Camino', description: 'Kiva\'s mood-targeted gummy line.', country: 'United States', featured: true },
  { manufacturer: 'CBX Cannabiotix', description: 'Las Vegas-bred top shelf indoor flower.', country: 'United States', featured: true },
  { manufacturer: 'Pacific Stone', description: 'Santa Barbara county greenhouse flower and pre-rolls.', country: 'United States', featured: true },
  { manufacturer: 'Heavy Hitters', description: 'High-potency cartridges and disposables.', country: 'United States', featured: true },
  { manufacturer: 'Papa & Barkley', description: 'Whole-plant infused balms, tinctures and patches.', country: 'United States', featured: true },
  { manufacturer: 'Lost Farm', description: 'Live resin chews and gummies from Kiva.', country: 'United States', featured: true },
  { manufacturer: 'Claybourne', description: 'Cold-cured flower, pre-rolls and concentrates.', country: 'United States', featured: true },
  { manufacturer: 'Wyld', description: 'Real-fruit gummies in tight cannabinoid ratios.', country: 'United States', featured: true },
  { manufacturer: 'Kurvana', description: 'Full-spectrum cartridges, strain-specific.', country: 'United States', featured: true },
  { manufacturer: 'Autumn Brands', description: 'Dutch family farm growing in Carpinteria.', country: 'United States', featured: false },
  { manufacturer: 'LEVEL', description: 'Cannabinoid-isolated tablingual and protab formats.', country: 'United States', featured: false },
]

interface SeedProduct {
  name: string
  slug: string
  brand: string
  brandLine: string
  category: string
  strainType: 'indica' | 'sativa' | 'hybrid' | 'cbd'
  price: number
  compareAtPrice?: number
  unitSize: string
  thc: number
  cbd: number
  rating: number
  reviewCount: number
  featured?: boolean
  description: string
  /** File under public/images/erba, picked per product rather than per category. */
  image: string
}

/**
 * ERBA's own photography, downloaded into public/images/erba. A dispensary
 * menu is judged on how the product looks, so stock placeholders were never
 * going to carry this page.
 */

const PRODUCTS: SeedProduct[] = [
  {
    name: 'Blue Flame OG',
    slug: 'blue-flame-og',
    brand: 'CBX Cannabiotix',
    brandLine: 'Top Shelf Indoor',
    category: 'flower',
    strainType: 'indica',
    price: 6000,
    unitSize: '3.5g',
    thc: 26.92,
    cbd: 0.04,
    rating: 4.8,
    reviewCount: 8,
    featured: true,
    description: 'Gassy OG nose with a sweet finish. Hand-trimmed, cold-cured, and the jar most of our budtenders take home.',
    image: 'product-cbx.jpg',
  },
  {
    name: 'Purple Carbonite',
    slug: 'purple-carbonite',
    brand: 'Autumn Brands',
    brandLine: 'Single Gram',
    category: 'flower',
    strainType: 'indica',
    price: 800,
    unitSize: '1g',
    thc: 26.51,
    cbd: 0.34,
    rating: 4.7,
    reviewCount: 6,
    description: 'Grown by a Dutch family farm in Carpinteria. Deep purple bag appeal, grape candy on the exhale.',
    image: 'product-flower.jpg',
  },
  {
    name: 'Pink Lotus',
    slug: 'pink-lotus',
    brand: 'STIIIZY',
    brandLine: 'White Label',
    category: 'flower',
    strainType: 'hybrid',
    price: 2100,
    compareAtPrice: 2800,
    unitSize: '3.5g',
    thc: 24.1,
    cbd: 0.06,
    rating: 4.4,
    reviewCount: 61,
    featured: true,
    description: 'Floral and creamy, an easy daytime eighth. The best value on the wall when it is in stock.',
    image: 'detail-1.jpg',
  },
  {
    name: 'Sour Diesel Smalls',
    slug: 'sour-diesel-smalls',
    brand: 'Pacific Stone',
    brandLine: 'Sun Grown Smalls',
    category: 'flower',
    strainType: 'sativa',
    price: 1000,
    unitSize: '3.5g',
    thc: 25.86,
    cbd: 0.04,
    rating: 3.8,
    reviewCount: 23,
    description: 'Smaller buds, same plant, a third of the price. Sharp fuel and citrus, best before noon.',
    image: 'product-flower.jpg',
  },
  {
    name: 'Magic Melon Pod',
    slug: 'magic-melon-pod',
    brand: 'STIIIZY',
    brandLine: 'STIIIZY Pod',
    category: 'cartridges',
    strainType: 'sativa',
    price: 2600,
    unitSize: '1g',
    thc: 86.23,
    cbd: 0.25,
    rating: 4.4,
    reviewCount: 31,
    featured: true,
    description: 'Honeydew and cut grass. Fits every STIIIZY battery on the counter.',
    image: 'product-cart.jpg',
  },
  {
    name: 'Pineapple Express Pod',
    slug: 'pineapple-express-pod',
    brand: 'STIIIZY',
    brandLine: 'STIIIZY Pod',
    category: 'cartridges',
    strainType: 'hybrid',
    price: 2600,
    unitSize: '1g',
    thc: 87.74,
    cbd: 0.22,
    rating: 4.7,
    reviewCount: 285,
    description: 'The one people ask for by name. Tropical, even, and consistent batch to batch.',
    image: 'product-cart.jpg',
  },
  {
    name: 'Orange Sunset Pod',
    slug: 'orange-sunset-pod',
    brand: 'STIIIZY',
    brandLine: 'STIIIZY Pod',
    category: 'cartridges',
    strainType: 'sativa',
    price: 2600,
    unitSize: '1g',
    thc: 87.4,
    cbd: 0.23,
    rating: 4.6,
    reviewCount: 102,
    description: 'Bright citrus, clean pull. Pairs with the afternoon you were already going to have.',
    image: 'detail-3.jpg',
  },
  {
    name: 'Strawberry Cough Cartridge',
    slug: 'strawberry-cough-cartridge',
    brand: 'Kurvana',
    brandLine: 'ASCND',
    category: 'cartridges',
    strainType: 'sativa',
    price: 5500,
    unitSize: '1g',
    thc: 89.1,
    cbd: 0.31,
    rating: 4.5,
    reviewCount: 74,
    description: 'Full-spectrum and strain-specific, no added terpenes. Berry and earth, very little throat hit.',
    image: 'product-cart.jpg',
  },
  {
    name: 'Midnight Blueberry Gummies',
    slug: 'midnight-blueberry-gummies',
    brand: 'Camino',
    brandLine: 'Camino Gummies',
    category: 'edibles',
    strainType: 'indica',
    price: 2300,
    unitSize: '20pk',
    thc: 100,
    cbd: 0,
    rating: 4.7,
    reviewCount: 1487,
    featured: true,
    description: 'Five to one CBN, twenty milligrams THC per piece. The sleep gummy we restock the most.',
    image: 'product-edible.jpg',
  },
  {
    name: 'Watermelon Lemonade Gummies',
    slug: 'watermelon-lemonade-gummies',
    brand: 'Camino',
    brandLine: 'Bliss',
    category: 'edibles',
    strainType: 'hybrid',
    price: 2100,
    unitSize: '20pk',
    thc: 100,
    cbd: 0,
    rating: 4.6,
    reviewCount: 682,
    description: 'Five milligrams a piece, so you can find your line without guessing.',
    image: 'product-edible.jpg',
  },
  {
    name: 'Marionberry Indica Gummies',
    slug: 'marionberry-indica-gummies',
    brand: 'Wyld',
    brandLine: 'Real Fruit Gummies',
    category: 'edibles',
    strainType: 'indica',
    price: 2200,
    unitSize: '10pk',
    thc: 100,
    cbd: 0,
    rating: 4.5,
    reviewCount: 391,
    description: 'Real fruit puree, ten milligrams each. Tastes like the jam, not like the plant.',
    image: 'detail-2.jpg',
  },
  {
    name: 'Pink Lemonade Live Resin Chews',
    slug: 'pink-lemonade-live-resin-chews',
    brand: 'Lost Farm',
    brandLine: 'Live Resin Fruit Chews',
    category: 'edibles',
    strainType: 'sativa',
    price: 2300,
    unitSize: '10pk',
    thc: 100,
    cbd: 0,
    rating: 4.6,
    reviewCount: 214,
    description: 'Made with live resin instead of distillate, so the strain actually comes through.',
    image: 'product-edible.jpg',
  },
  {
    name: 'Wedding Cake Pre-Roll 2 Pack',
    slug: 'wedding-cake-pre-roll-2-pack',
    brand: 'Pacific Stone',
    brandLine: '2 Pack Pre-Roll',
    category: 'pre-rolls',
    strainType: 'indica',
    price: 800,
    unitSize: '2 x 0.5g',
    thc: 23.92,
    cbd: 0.19,
    rating: 4.5,
    reviewCount: 18,
    featured: true,
    description: 'Two half grams, rolled tight, burns clean to the crutch. Eight dollars all day.',
    image: 'product-preroll.jpg',
  },
  {
    name: 'Grower\'s Collection Sativa 6 Pack',
    slug: 'growers-collection-sativa-6-pack',
    brand: 'Autumn Brands',
    brandLine: '6 Pack Pre-Roll',
    category: 'pre-rolls',
    strainType: 'sativa',
    price: 2300,
    unitSize: '6 x 0.6g',
    thc: 25.19,
    cbd: 0.26,
    rating: 4.4,
    reviewCount: 44,
    description: 'Six 0.6 gram joints from whole flower, not trim. The pack to bring, not the one to keep.',
    image: 'product-preroll.jpg',
  },
  {
    name: 'Cold Cured Live Rosin Badder',
    slug: 'cold-cured-live-rosin-badder',
    brand: 'Claybourne',
    brandLine: 'Cold Cured',
    category: 'concentrates',
    strainType: 'hybrid',
    price: 4500,
    unitSize: '1g',
    thc: 78.4,
    cbd: 0.4,
    rating: 4.6,
    reviewCount: 57,
    description: 'Solventless, pressed from fresh frozen, whipped to a badder. Low temp or you waste it.',
    image: 'detail-1.jpg',
  },
  {
    name: 'Papaya Live Resin Sauce',
    slug: 'papaya-live-resin-sauce',
    brand: 'Heavy Hitters',
    brandLine: 'Live Resin',
    category: 'concentrates',
    strainType: 'indica',
    price: 4000,
    compareAtPrice: 5000,
    unitSize: '1g',
    thc: 81.2,
    cbd: 0.28,
    rating: 4.3,
    reviewCount: 39,
    description: 'Terpene-heavy sauce with visible diamonds. Tropical and heavy in equal measure.',
    image: 'detail-3.jpg',
  },
  {
    name: 'Releaf Balm',
    slug: 'releaf-balm',
    brand: 'Papa & Barkley',
    brandLine: 'Releaf',
    category: 'wellness',
    strainType: 'cbd',
    price: 3400,
    unitSize: '50ml',
    thc: 3,
    cbd: 3,
    rating: 4.8,
    reviewCount: 903,
    featured: true,
    description: 'One to three THC to CBD in a coconut oil base. Goes on the joint that hurts, nothing else happens.',
    image: 'detail-2.jpg',
  },
  {
    name: 'CBD Protab 10 Pack',
    slug: 'cbd-protab-10-pack',
    brand: 'LEVEL',
    brandLine: 'Protab',
    category: 'wellness',
    strainType: 'cbd',
    price: 3000,
    unitSize: '10pk',
    thc: 1,
    cbd: 25,
    rating: 4.5,
    reviewCount: 128,
    description: 'Twenty five milligrams CBD per tablet, effectively no high. Swallow it and get on with the day.',
    image: 'store-back.jpg',
  },
  {
    name: 'Blue Dream Live Rosin Cart',
    slug: 'blue-dream-live-rosin-cart',
    brand: 'Claybourne',
    brandLine: 'Solventless Cart',
    category: 'cartridges',
    strainType: 'hybrid',
    price: 5200,
    unitSize: '1g',
    thc: 74.6,
    cbd: 0.42,
    rating: 4.4,
    reviewCount: 46,
    description: 'Rosin in a cartridge, so it tastes like the plant rather than a flavour. Runs best on a low setting.',
    image: 'product-cart.jpg',
  },
  {
    name: 'Sunset Sherbert Infused Pre-Roll',
    slug: 'sunset-sherbert-infused-pre-roll',
    brand: 'Heavy Hitters',
    brandLine: 'Infused Single',
    category: 'pre-rolls',
    strainType: 'indica',
    price: 1800,
    unitSize: '1g',
    thc: 38.4,
    cbd: 0.11,
    rating: 4.2,
    reviewCount: 71,
    description: 'Flower rolled with diamonds through the middle. Strong, and worth splitting with someone.',
    image: 'product-preroll.jpg',
  },
]

export default function (cli: CLI): void {
  cli
    .command('seed:catalog', 'Load the ERBA storefront: stores, specials, brands, categories and menu')
    .option('--fresh', 'Delete existing catalog rows before loading', { default: false })
    .alias('catalog')
    .action(async (options: SeedOptions) => {
      try {
        if (options.fresh) {
          await Product.query().delete()
          await Special.query().delete()
          await Store.query().delete()
          await Category.query().delete()
          await Manufacturer.query().delete()
          log.info('Cleared the existing catalog')
        }

        const storeCount = await upsertAll(
          Store,
          STORES.map(store => ({ ...store, amenities: JSON.stringify(store.amenities) })),
          'slug',
        )
        log.success(`Stores: ${storeCount}`)

        const specialCount = await upsertAll(
          Special,
          SPECIALS.map(special => ({ ...special, brands: JSON.stringify(special.brands), storeSlug: special.storeSlug ?? '' })),
          'dayOfWeek',
        )
        log.success(`Specials: ${specialCount}`)

        /*
         * The tax components, written once and then owned by the dashboard.
         *
         * Keyed on `code`, so a rerun does not overwrite a rate somebody
         * changed under Commerce → Taxes. That matters more than it looks: the
         * state moves the excise rate on its own schedule, and a seeder that
         * quietly restored last quarter's number on the next deploy would be
         * hard to notice and expensive to have missed.
         */
        const taxCount = await upsertAll(
          TaxRate,
          taxConfig.seedRates.map(seed => ({
            code: seed.code,
            name: seed.name,
            rate: seed.rate,
            exemptible: seed.exemptible,
            type: 'Cannabis',
            country: 'United States',
            region: 'North America',
            status: 'active',
            isDefault: false,
          })),
          'code',
          { skipExisting: true },
        )
        log.success(`Tax rates: ${taxCount}`)

        const categoryCount = await upsertAll(Category, CATEGORIES.map(category => ({ ...category, isActive: true })), 'slug')
        log.success(`Categories: ${categoryCount}`)

        const manufacturerCount = await upsertAll(Manufacturer, MANUFACTURERS, 'manufacturer')
        log.success(`Brands: ${manufacturerCount}`)

        const categoryIds = await idsByColumn(Category, 'slug')
        const manufacturerIds = await idsByColumn(Manufacturer, 'manufacturer')

        let productCount = 0
        for (const product of PRODUCTS) {
          const row = {
            name: product.name,
            slug: product.slug,
            description: product.description,
            price: product.price,
            compareAtPrice: product.compareAtPrice ?? 0,
            unitSize: product.unitSize,
            strainType: product.strainType,
            thcPercentage: product.thc,
            cbdPercentage: product.cbd,
            brandLine: product.brandLine,
            imageUrl: `/images/erba/${product.image}`,
            rating: product.rating,
            reviewCount: product.reviewCount,
            isFeatured: product.featured ?? false,
            isAvailable: true,
            inventoryCount: 40,
            preparationTime: 15,
            allergens: JSON.stringify([]),
            nutritionalInfo: JSON.stringify({}),
            categoryId: categoryIds.get(product.category) ?? null,
            manufacturerId: manufacturerIds.get(product.brand) ?? null,
          }

          const existing = await Product.where('slug', product.slug).first()
          if (existing)
            await Product.where('slug', product.slug).update(row)
          else
            await Product.create(row)

          productCount++
        }

        log.success(`Products: ${productCount}`)
        log.info('Storefront is loaded. Run `./buddy dev` and open the menu.')
      }
      catch (error) {
        log.error('Could not load the catalog')
        console.error(error)
        process.exit(ExitCode.FatalError)
      }

      process.exit(ExitCode.Success)
    })
}

/** Insert rows that are new, update the ones already there, keyed on one column. */
async function upsertAll(
  model: any,
  rows: Record<string, any>[],
  key: string,
  /**
   * `skipExisting` leaves a row alone once it exists.
   *
   * The default is to overwrite, which is right for content this file owns —
   * store hours, deal copy, category names. It is wrong for anything an
   * operator can edit afterwards: rewriting a tax rate somebody changed in the
   * dashboard would quietly restore last quarter's number on the next deploy,
   * and nobody would see it until an accountant did.
   */
  options: { skipExisting?: boolean } = {},
): Promise<number> {
  for (const row of rows) {
    const existing = await model.where(key, row[key]).first()

    if (existing && options.skipExisting)
      continue

    if (existing)
      await model.where(key, row[key]).update(row)
    else
      await model.create(row)
  }

  return rows.length
}

async function idsByColumn(model: any, column: string): Promise<Map<string, number>> {
  const rows = await model.query().get()
  return new Map(rows.map((row: any) => [row[column], row.id]))
}
