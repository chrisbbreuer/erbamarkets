import { defineModel } from '@stacksjs/orm'
import { slug } from '@stacksjs/strings'
import { schema } from '@stacksjs/validation'

/**
 * Overrides the framework's commerce Product (which is shaped for restaurant
 * menus) with the fields a California dispensary menu actually prints:
 * strain type, potency, and the unit the price is quoted in.
 *
 * The framework's own attributes are kept as-is rather than trimmed. The
 * commerce dashboard reads `preparationTime`, `allergens` and
 * `nutritionalInfo` directly, and dropping them here would break those views;
 * `allergens` and `nutritionalInfo` also carry real meaning for edibles.
 */
export default defineModel({
  name: 'Product',
  table: 'products',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'name', 'description', 'price', 'strainType', 'thcPercentage', 'isAvailable', 'inventoryCount'],
      searchable: ['name', 'description', 'brandLine'],
      sortable: ['price', 'thcPercentage', 'rating', 'createdAt', 'inventoryCount'],
      filterable: ['categoryId', 'manufacturerId', 'strainType', 'isAvailable', 'isFeatured'],
    },

    useSeeder: { count: 0 },

    useApi: {
      // Public catalog: anyone may browse, only authenticated callers may write.
      middleware: { read: [], write: ['auth'] },
      uri: 'products',
    },

    observe: true,
  },

  belongsTo: ['Category', 'Manufacturer'],

  hasMany: ['Review', 'ProductUnit', 'ProductVariant', 'LicenseKey', 'WaitlistProduct', 'Coupon', 'StoreProduct'],

  attributes: {
    name: {
      order: 1,
      fillable: true,
      validation: {
        rule: schema.string().required().max(120),
        message: { max: 'Name must have a maximum of 120 characters' },
      },
      factory: faker => faker.commerce.productName(),
    },

    slug: {
      order: 2,
      unique: true,
      fillable: true,
      validation: { rule: schema.string().required().max(140) },
      factory: faker => slug(faker.commerce.productName()),
    },

    description: {
      order: 3,
      fillable: true,
      validation: { rule: schema.string() },
      factory: faker => faker.commerce.productDescription(),
    },

    /** Price in cents, matching the rest of the commerce bundle. */
    price: {
      order: 4,
      fillable: true,
      validation: {
        rule: schema.number().required().min(1),
        message: { min: 'Price must be at least 1' },
      },
      factory: faker => faker.number.int({ min: 400, max: 9000 }),
    },

    /** Compare-at price in cents. Zero when the item is not on promotion. */
    compareAtPrice: {
      order: 5,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    /** The unit the price is quoted in: "3.5g", "1g", "10pk", "100mg". */
    unitSize: {
      order: 6,
      fillable: true,
      validation: { rule: schema.string().max(24) },
      factory: faker => faker.helpers.arrayElement(['1g', '3.5g', '7g', '10pk', '20pk']),
    },

    strainType: {
      order: 7,
      fillable: true,
      default: 'hybrid',
      validation: {
        rule: schema.enum(['indica', 'sativa', 'hybrid', 'cbd']),
        message: { enum: 'Strain type must be one of: indica, sativa, hybrid, cbd' },
      },
      factory: faker => faker.helpers.arrayElement(['indica', 'sativa', 'hybrid', 'cbd']),
    },

    thcPercentage: {
      order: 8,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0).max(100) },
      factory: faker => faker.number.float({ min: 0.1, max: 92, fractionDigits: 2 }),
    },

    cbdPercentage: {
      order: 9,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0).max(100) },
      factory: faker => faker.number.float({ min: 0, max: 12, fractionDigits: 2 }),
    },

    /** Product line under the manufacturer, e.g. "STIIIZY Pod", "Live Resin Gummies". */
    brandLine: {
      order: 10,
      fillable: true,
      validation: { rule: schema.string().max(80) },
      factory: () => '',
    },

    imageUrl: {
      order: 11,
      fillable: true,
      validation: {
        rule: schema.string(),
        message: { string: 'Image URL must be a string' },
      },
      factory: faker => faker.image.url(),
    },

    /**
     * The colour a card shows while the photograph is still arriving.
     *
     * Every product image comes from Jane's CDN, so there is no build step
     * that could have looked at one — `buddy images:build` only sees the files
     * we host. Deriving it at render would mean six hundred outbound fetches
     * before the first byte of HTML, so `menu:sync` works it out once, when it
     * imports the product, and it lives here.
     *
     * A hex colour rather than a hash: a decoded SplatHash is a 4KB data URL,
     * which is nothing on a page holding three of them and 2.5MB on a menu
     * holding six hundred. At the size a card draws a product, the average of
     * the photograph is most of the effect for twenty bytes.
     */
    imagePlaceholder: {
      order: 12,
      fillable: true,
      default: '',
      validation: {
        rule: schema.string().max(9),
        message: { string: 'Image placeholder must be a hex colour' },
      },
      factory: () => '',
    },

    rating: {
      order: 12,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0).max(5) },
      factory: faker => faker.number.float({ min: 3.5, max: 5, fractionDigits: 1 }),
    },

    reviewCount: {
      order: 13,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0) },
      factory: faker => faker.number.int({ min: 0, max: 1500 }),
    },

    isFeatured: {
      order: 14,
      fillable: true,
      default: false,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    isAvailable: {
      order: 15,
      fillable: true,
      default: true,
      validation: { rule: schema.boolean() },
      factory: () => true,
    },

    inventoryCount: {
      order: 16,
      fillable: true,
      validation: {
        rule: schema.number().min(0),
        message: { min: 'Inventory count must be at least 0' },
      },
      factory: faker => faker.number.int({ min: 0, max: 100 }),
    },

    /** Minutes to prepare a pickup bag. Read by the commerce dashboard. */
    preparationTime: {
      order: 17,
      fillable: true,
      default: 15,
      validation: {
        rule: schema.number().required().min(1),
        message: { min: 'Preparation time must be at least 1 minute' },
      },
      factory: () => 15,
    },

    /** JSON array. Meaningful for edibles, empty for everything else. */
    allergens: {
      order: 18,
      fillable: true,
      validation: { rule: schema.string() },
      factory: () => JSON.stringify([]),
    },

    /** JSON object. Cannabinoid milligrams per serving for edibles. */
    nutritionalInfo: {
      order: 19,
      fillable: true,
      validation: { rule: schema.string() },
      factory: () => JSON.stringify({}),
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)
