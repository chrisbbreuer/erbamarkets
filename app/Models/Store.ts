import { defineModel } from '@stacksjs/orm'
import { slug } from '@stacksjs/strings'
import { schema } from '@stacksjs/validation'

/**
 * A physical ERBA dispensary.
 *
 * Every storefront-facing number on the site (hours, phones, license,
 * delivery window) is read from here rather than hardcoded in a template,
 * because these change often and are printed in four places each: the
 * location section, the delivery section, the footer, and structured data.
 */
export default defineModel({
  name: 'Store',
  table: 'stores',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'name', 'city', 'isActive'],
      searchable: ['name', 'addressLine', 'city'],
      sortable: ['displayOrder', 'name'],
      filterable: ['isActive', 'city'],
    },

    useSeeder: { count: 0 },

    useApi: {
      // Store hours and addresses are public information; writes are staff-only.
      middleware: { read: [], write: ['auth'] },
      uri: 'stores',
      routes: ['index', 'show', 'store', 'update', 'destroy'],
    },
  },

  attributes: {
    name: {
      order: 1,
      fillable: true,
      required: true,
      validation: { rule: schema.string().required().max(80) },
      factory: () => 'ERBA Sawtelle',
    },

    slug: {
      order: 2,
      unique: true,
      fillable: true,
      required: true,
      validation: { rule: schema.string().required().max(80) },
      factory: () => slug('ERBA Sawtelle'),
    },

    /** Short label used in nav and tabs, e.g. "Sawtelle". */
    shortName: {
      order: 3,
      fillable: true,
      required: true,
      validation: { rule: schema.string().required().max(40) },
      factory: () => 'Sawtelle',
    },

    addressLine: {
      order: 4,
      fillable: true,
      required: true,
      validation: { rule: schema.string().required().max(160) },
      factory: () => '2304 Sawtelle Blvd',
    },

    city: {
      order: 5,
      fillable: true,
      default: 'Los Angeles',
      validation: { rule: schema.string().max(80) },
      factory: () => 'Los Angeles',
    },

    state: {
      order: 6,
      fillable: true,
      default: 'CA',
      validation: { rule: schema.string().max(2) },
      factory: () => 'CA',
    },

    postalCode: {
      order: 7,
      fillable: true,
      validation: { rule: schema.string().max(10) },
      factory: () => '90064',
    },

    storePhone: {
      order: 8,
      fillable: true,
      validation: { rule: schema.string().max(20) },
      factory: () => '310-616-5140',
    },

    deliveryPhone: {
      order: 9,
      fillable: true,
      validation: { rule: schema.string().max(20) },
      factory: () => '310-616-5140',
    },

    email: {
      order: 10,
      fillable: true,
      validation: { rule: schema.string().max(120) },
      factory: () => 'delivery@erbasawtelle.com',
    },

    /** California BCC retail license, printed alongside every store block. */
    licenseNumber: {
      order: 11,
      fillable: true,
      validation: { rule: schema.string().max(40) },
      factory: () => 'C10-0000626-LIC',
    },

    storeHours: {
      order: 12,
      fillable: true,
      validation: { rule: schema.string().max(60) },
      factory: () => '8AM - 10PM',
    },

    deliveryHours: {
      order: 13,
      fillable: true,
      validation: { rule: schema.string().max(60) },
      factory: () => '10AM - 8PM',
    },

    pickupHours: {
      order: 14,
      fillable: true,
      validation: { rule: schema.string().max(60) },
      factory: () => 'TBA',
    },

    /** JSON array of amenity labels: delivery, curbside, ATM, parking, valet. */
    amenities: {
      order: 15,
      fillable: true,
      validation: { rule: schema.string() },
      factory: () => JSON.stringify(['Delivery', 'In-Store Shopping', 'ATM', 'Off-Street Parking']),
    },

    mapUrl: {
      order: 16,
      fillable: true,
      validation: { rule: schema.string() },
      factory: () => 'https://maps.app.goo.gl/Szvf1TP2Wh5iaHkQ9',
    },

    imageUrl: {
      order: 17,
      fillable: true,
      validation: { rule: schema.string() },
      factory: () => '',
    },

    /** Free delivery above this amount, in dollars. Zero means no minimum. */
    deliveryMinimum: {
      order: 18,
      fillable: true,
      default: 30,
      validation: { rule: schema.number().min(0) },
      factory: () => 30,
    },

    displayOrder: {
      order: 19,
      fillable: true,
      default: 1,
      validation: { rule: schema.number() },
      factory: () => 1,
    },

    isActive: {
      order: 20,
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
