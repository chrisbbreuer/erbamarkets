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
  // Root-level files a crawler asks for: /sitemap.xml and /robots.txt. `web`
  // is the one key the loader mounts without a prefix. Both are listed under
  // `proxy.paths` in config/server.ts so the views server forwards them here
  // rather than looking for a page.
  'web': 'web',

  // Storefront: bag, checkout, VIP signup.
  'api': 'api',

  // Sign-in, pointing at the framework's own auth actions.
  'auth': { path: 'auth', prefix: '/api' },

  // Social sign-in redirects and callbacks. Under /api because that is the
  // only prefix the site origin proxies through to this server: a bare
  // /auth/* lands on the stx page router and 404s in the browser, even though
  // the route answers correctly on the API port.
  'social': { path: 'social', prefix: '/api/auth' },

  // Menu search, backed by Typesense with a database fallback.
  'menu': { path: 'menu', prefix: '/api' },

  // Delivery: driver position ingest and stop lifecycle (staff-authed), plus
  // the customer's tracking read, which authorises on an order's token.
  'delivery': { path: 'delivery', prefix: '/api/delivery' },
} satisfies RouteRegistry
