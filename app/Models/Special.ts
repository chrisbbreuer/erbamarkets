import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A recurring weekday deal ("Tank Tuesday", "Twist Up Thursday").
 *
 * Specials rotate often and are the single most-edited piece of copy on a
 * dispensary site, so they live in the database rather than in the template.
 */
export default defineModel({
  name: 'Special',
  table: 'specials',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'title', 'dayOfWeek', 'isActive'],
      searchable: ['title', 'offer', 'brands'],
      sortable: ['dayOfWeek'],
      filterable: ['dayOfWeek', 'isActive'],
    },

    useSeeder: { count: 0 },

    useApi: {
      // Deals are advertising: public to read, staff-only to change.
      middleware: { read: [], write: ['auth'] },
      uri: 'specials',
      routes: ['index', 'show', 'store', 'update', 'destroy'],
    },
  },

  attributes: {
    /** 0 = Sunday, matching `Date.prototype.getDay()`. */
    dayOfWeek: {
      order: 1,
      fillable: true,
      required: true,
      validation: {
        rule: schema.number().required().min(0).max(6),
        message: { max: 'Day of week must be 0 (Sunday) through 6 (Saturday)' },
      },
      factory: () => 1,
    },

    dayLabel: {
      order: 2,
      fillable: true,
      required: true,
      validation: { rule: schema.string().required().max(20) },
      factory: () => 'Monday',
    },

    title: {
      order: 3,
      fillable: true,
      required: true,
      validation: { rule: schema.string().required().max(80) },
      factory: () => 'Monday Munchies',
    },

    /** The deal itself, e.g. "30% off cartridges and disposables". */
    offer: {
      order: 4,
      fillable: true,
      required: true,
      validation: { rule: schema.string().required().max(200) },
      factory: () => 'Buy an edible, get the second one half off',
    },

    /** JSON array of participating brand names. */
    brands: {
      order: 5,
      fillable: true,
      validation: { rule: schema.string() },
      factory: () => JSON.stringify([]),
    },

    /** Empty when the deal runs at every location. */
    storeSlug: {
      order: 6,
      fillable: true,
      default: '',
      validation: { rule: schema.string().max(80) },
      factory: () => '',
    },

    isActive: {
      order: 7,
      fillable: true,
      default: true,
      validation: { rule: schema.boolean() },
      factory: () => true,
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)
