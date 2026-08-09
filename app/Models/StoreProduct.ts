import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * What one shop has, at what price, right now.
 *
 * A dispensary's catalog is not a catalog — it is two catalogs that mostly
 * overlap. The same SKU is stocked at one location and not the other, and when
 * both carry it the price can differ, because California cannabis excise and
 * local gross-receipts tax are levied per storefront. Holding price and stock
 * on `Product` says there is one answer, and the menu then quotes a number
 * that is wrong for whichever shop the customer is standing in.
 *
 * So `Product` keeps what is true of the item everywhere — name, brand, strain,
 * potency, description, photography — and every fact that depends on *where*
 * lives here.
 *
 * The pair (store, product) is unique; the importer upserts on it.
 */
export default defineModel({
  name: 'StoreProduct',
  table: 'store_products',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'storeId', 'productId', 'price', 'isAvailable', 'stockCount'],
      searchable: [],
      sortable: ['price', 'stockCount', 'updatedAt'],
      filterable: ['storeId', 'productId', 'isAvailable', 'fulfillment'],
    },

    useSeeder: { count: 0 },

    useApi: {
      // Stock levels are public — the menu prints them. Writes are the
      // importer's job and go through an authenticated call.
      middleware: { read: [], write: ['auth'] },
      uri: 'store-products',
    },

    observe: true,
  },

  belongsTo: ['Store', 'Product'],

  attributes: {
    /** Cents at this store, tax exclusive. */
    price: {
      order: 1,
      fillable: true,
      validation: {
        rule: schema.number().required().min(0),
        message: { min: 'Price cannot be negative' },
      },
      factory: faker => faker.number.int({ min: 400, max: 9000 }),
    },

    /**
     * Cents before the current promotion, or zero when there is none.
     *
     * Kept per store because a brand discount is funded by the brand for a
     * particular shop's inventory, and routinely runs at one and not the other.
     */
    compareAtPrice: {
      order: 2,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    /**
     * The unit this store's price is quoted in: "3.5g", "1g", "10pk".
     *
     * Per store because the same product is often stocked in different weights
     * at each — an eighth at one, a quarter at the other.
     */
    unitSize: {
      order: 3,
      fillable: true,
      default: '',
      validation: { rule: schema.string().max(24) },
      factory: () => '',
    },

    isAvailable: {
      order: 4,
      fillable: true,
      default: true,
      validation: { rule: schema.boolean() },
      factory: () => true,
    },

    /**
     * Units on hand, or -1 when the source does not say.
     *
     * Distinguished from 0 deliberately: zero means the shop has told us it is
     * out, and the menu should say "sold out at Sawtelle, in stock at West LA".
     * Unknown means we have no basis for that sentence and should stay quiet.
     */
    stockCount: {
      order: 5,
      fillable: true,
      default: -1,
      validation: { rule: schema.number().min(-1) },
      factory: () => -1,
    },

    /**
     * How this store will hand the item over: `pickup`, `delivery`, or `both`.
     *
     * Not every SKU can be delivered even from a shop that delivers — some
     * brands restrict it, and a store's delivery radius is licensed separately
     * from its retail counter.
     */
    fulfillment: {
      order: 6,
      fillable: true,
      default: 'both',
      validation: {
        rule: schema.enum(['pickup', 'delivery', 'both', 'none']),
        message: { enum: 'Fulfillment must be one of: pickup, delivery, both, none' },
      },
      factory: () => 'both',
    },

    /**
     * The id this product carries in the store's own point-of-sale menu.
     *
     * The importer's upsert key. Kept per store rather than on `Product`
     * because the same item is a different row in each shop's POS, and it is
     * the only identifier that survives a product being renamed upstream.
     */
    sourceId: {
      order: 7,
      fillable: true,
      default: '',
      validation: { rule: schema.string().max(64) },
      factory: () => '',
    },

    /** When the importer last saw this row in the upstream menu. */
    syncedAt: {
      order: 8,
      fillable: true,
      validation: { rule: schema.string() },
      factory: () => new Date().toISOString(),
    },
  },
})
