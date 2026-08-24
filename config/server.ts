import type { ServerConfig } from '@stacksjs/types'

/**
 * **Server Configuration**
 *
 * How the views server behaves, shared by `buddy dev` and `buddy serve`.
 */
export default {
  /**
   * The storefront's own endpoints all live under `/api/**`, which is
   * forwarded without configuration.
   *
   * These two do not, because a crawler will only ever look for them at the
   * root. They are declared in `routes/web.ts` and generated from the store
   * rows, so the sitemap knows which store pages exist. Listing a path here
   * shadows a `public/` file of the same name, which is why neither exists as
   * a static file.
   */
  proxy: {
    // The store switcher is a parameterised path, so it needs a prefix rather
    // than an exact entry. Singular `/store/`; the public location pages are
    // `/stores/{slug}` and stay with the page router.
    // `/img/` too: the image resizer answers at the site origin, and without
    // this the views server looks for a page called "img" and 404s.
    prefixes: ['/store/', '/img'],
    paths: ['/sitemap.xml', '/robots.txt'],
  },

  /**
   * **Where the old site's URLs went.**
   *
   * erbamarkets.com ran on Squarespace for six years, and those URLs are what
   * Google has indexed, what the Google Business listing points at, and what is
   * printed on packaging. Every one of them is answered here so the move costs
   * no search standing and no customer lands on a 404.
   *
   * Left out deliberately:
   *
   * - `/events` and the fifteen `/events-erba-pico/*` pages. Every event on
   *   them happened in January 2020 and the calendar has not been touched
   *   since. They go to the specials page, which is the live version of the
   *   same promise.
   * - `/heavyhitters` and `/select`, brand landing pages whose every "buy"
   *   link pointed at a Dutchie menu that no longer exists. They go to the
   *   brand filter on the menu, which is the same list, live.
   * - `/privacy` (the unfinished second copy), `/faq-brine` and
   *   `/terms-brine`, which were Squarespace template pages still full of
   *   lorem ipsum. They go to the real pages of the same name.
   */
  redirects: {
    // Ordering and the menu.
    '/order-online': '/menu',
    '/order-online-1': '/menu',
    '/pico-menus': '/menu',
    '/pico-rec': '/menu',
    '/pico-med': '/menu',
    '/daily-specials': '/specials',

    // The stores.
    '/erba-sawtelle': '/stores/erba-sawtelle',
    '/erba-west-la': '/stores/erba-west-la',
    '/location': '/#locations',
    '/360': '/tour',

    // Company and legal. The old site had two of most of these, one real and
    // one an unfinished template page.
    '/our-story': '/story',
    '/about-1': '/story',
    '/delivery-faq': '/delivery',
    '/privacy-policy': '/privacy',
    '/terms-conditions': '/terms',
    '/terms-brine': '/terms',
    '/faq-brine': '/faqs',
    '/contact-1': '/contact',

    // The VIP signup form, which lived on its own page.
    '/form': '/#vip',

    // Stale campaign pages. See the note above.
    '/events': '/specials',
    '/events-erba-pico': '/specials',
    '/heavyhitters': '/menu?brand=Heavy%20Hitters',
    '/select': '/brands',

    // A duplicate of the homepage Squarespace left behind.
    '/home-1': '/',
  },
} satisfies ServerConfig
