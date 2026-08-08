import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * Something a person sent us through the website.
 *
 * Two forms feed this table - the contact form and the careers application -
 * because they are the same shape underneath: somebody's name, a way to reach
 * them, and prose. Splitting them into two tables would double the migrations
 * and the dashboard views to store one differing column.
 *
 * `kind` says which form it came from, and `details` holds the fields that only
 * one of them has (the position applied for, the shift they can work) as JSON,
 * so adding a question to the careers form later is a template change rather
 * than a migration.
 *
 * These rows are personal information, so every generated CRUD route is
 * auth-gated. The public write path is the dedicated `/api/contact` and
 * `/api/careers` handler in routes/api.ts, which validates before it writes.
 */
export default defineModel({
  name: 'Inquiry',
  table: 'inquiries',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'kind', 'name', 'email', 'subject', 'status'],
      searchable: ['name', 'email', 'subject', 'message'],
      sortable: ['createdAt', 'status'],
      filterable: ['kind', 'status'],
    },

    useSeeder: { count: 0 },

    useApi: {
      // Nobody reads someone else's message. Staff only, both ways.
      middleware: ['auth'],
      uri: 'inquiries',
      routes: ['index', 'show', 'update', 'destroy'],
    },
  },

  attributes: {
    /** `contact` or `careers`. */
    kind: {
      order: 1,
      fillable: true,
      required: true,
      default: 'contact',
      validation: { rule: schema.string().required().max(20) },
      factory: () => 'contact',
    },

    name: {
      order: 2,
      fillable: true,
      required: true,
      validation: { rule: schema.string().required().max(120) },
      factory: () => 'Jamie Rivera',
    },

    email: {
      order: 3,
      fillable: true,
      required: true,
      validation: { rule: schema.string().required().email().max(255) },
      factory: () => 'jamie@example.com',
    },

    /** Optional on the contact form, required by the careers one. */
    phone: {
      order: 4,
      fillable: true,
      default: '',
      validation: { rule: schema.string().max(40) },
      factory: () => '',
    },

    /** The chosen subject, or the position applied for. */
    subject: {
      order: 5,
      fillable: true,
      default: '',
      validation: { rule: schema.string().max(160) },
      factory: () => 'An order I have placed',
    },

    message: {
      order: 6,
      fillable: true,
      default: '',
      validation: { rule: schema.string().max(5000) },
      factory: () => '',
    },

    /** JSON object of the fields only one of the two forms asks for. */
    details: {
      order: 7,
      fillable: true,
      default: '{}',
      validation: { rule: schema.string() },
      factory: () => '{}',
    },

    /** `new`, `open` or `closed`, for whoever works the inbox. */
    status: {
      order: 8,
      fillable: true,
      default: 'new',
      validation: { rule: schema.string().max(20) },
      factory: () => 'new',
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)
