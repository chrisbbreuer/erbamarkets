import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * The framework's commerce Cart, plus the one column a storefront with guest
 * checkout needs: a token that ties a browser to its bag before anyone signs
 * in. `customerId` only exists once a customer does.
 *
 * Everything else is the framework definition unchanged, so the commerce
 * dashboard and the Cart/CartItem relationship keep working.
 */
export default defineModel({
  name: 'Cart',
  table: 'carts',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'customerId', 'status', 'totalItems', 'subtotal', 'total', 'expiresAt'],
      searchable: ['id', 'customerId', 'status'],
      sortable: ['createdAt', 'updatedAt', 'expiresAt', 'total'],
      filterable: ['status', 'customerId'],
    },

    useSeeder: { count: 0 },

    useApi: {
      uri: 'carts',
      middleware: ['auth'],
    },

    observe: true,
  },

  hasMany: ['CartItem'],
  belongsTo: ['Customer', 'Coupon'],

  attributes: {
    /** Opaque token stored in the visitor's cart cookie. */
    sessionToken: {
      order: 1,
      unique: true,
      fillable: true,
      validation: { rule: schema.string().max(64) },
      factory: () => '',
    },

    status: {
      order: 2,
      default: 'active',
      fillable: true,
      validation: { rule: schema.enum(['active', 'abandoned', 'converted', 'expired']) },
      factory: () => 'active',
    },

    /** Which dispensary fulfils the bag. Menus and stock differ per store. */
    storeSlug: {
      order: 3,
      fillable: true,
      default: 'erba-west-la',
      validation: { rule: schema.string().max(80) },
      factory: () => 'erba-west-la',
    },

    /** 'delivery' or 'pickup'. Set at checkout, defaults to the busier one. */
    fulfillment: {
      order: 4,
      fillable: true,
      default: 'delivery',
      validation: { rule: schema.enum(['delivery', 'pickup']) },
      factory: () => 'delivery',
    },

    totalItems: {
      order: 5,
      default: 0,
      fillable: true,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    subtotal: {
      order: 6,
      default: 0,
      fillable: true,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    taxAmount: {
      order: 7,
      default: 0,
      fillable: true,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    discountAmount: {
      order: 8,
      default: 0,
      fillable: true,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    total: {
      order: 9,
      default: 0,
      fillable: true,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    expiresAt: {
      order: 10,
      fillable: true,
      validation: { rule: schema.timestamp() },
      factory: () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 19).replace('T', ' '),
    },

    currency: {
      order: 11,
      default: 'USD',
      fillable: true,
      validation: { rule: schema.string().max(3) },
      factory: () => 'USD',
    },

    notes: {
      order: 12,
      fillable: true,
      validation: { rule: schema.string().max(1000) },
      factory: () => '',
    },

    appliedCouponId: {
      order: 13,
      fillable: true,
      validation: { rule: schema.string() },
      factory: () => '',
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)
