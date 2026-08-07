/**
 * Route Registry
 *
 * The key becomes the URL prefix. `api` is auto-prefixed with `/api` by the
 * route loader so user routes line up with the dev proxy's forward path.
 *
 * @see https://docs.stacksjs.org/routing
 */
import type { RouteRegistry } from '@stacksjs/router'

export type { RouteDefinition, RouteRegistry } from '@stacksjs/router'

export default {
  // Storefront: bag, checkout, VIP signup.
  'api': 'api',

  // Menu search, backed by Typesense with a database fallback.
  'menu': { path: 'menu', prefix: '/api' },

  // Delivery: driver position ingest and stop lifecycle (staff-authed), plus
  // the customer's tracking read, which authorises on an order's token.
  'delivery': { path: 'delivery', prefix: '/api/delivery' },
} satisfies RouteRegistry
