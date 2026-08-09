import { route } from '@stacksjs/router'
import Product from '../app/Models/Product'
import Store from '../app/Models/Store'

/**
 * The two files a crawler asks for before it reads anything else.
 *
 * These are routes rather than static files in `public/` because the sitemap
 * has to know which store and product pages exist, and that is a database
 * question. A checked-in XML file would be correct on the day it was written
 * and wrong the first time a product is added - and nothing would fail, the
 * page would just quietly never be indexed.
 *
 * Registered at the root by `app/Routes.ts` under the `web` key, which is the
 * one key the route loader mounts without a prefix. The views server forwards
 * both paths to this process because `config/server.ts` lists them under
 * `proxy.paths`; without that they would 404 against the page router.
 */

/**
 * Where the site actually answers.
 *
 * Both files require absolute URLs - a sitemap `<loc>` without a scheme is
 * rejected outright, and it fails silently in the sense that the file parses
 * as far as a human reading it is concerned. `APP_URL` is written without one
 * in local environments (`erbamarkets.localhost`), so a scheme is added when
 * it is missing rather than assumed to be there.
 */
function siteUrl(): string {
  const configured = (process.env.APP_URL || 'https://www.erbamarkets.com').trim().replace(/\/+$/, '')

  if (/^https?:\/\//i.test(configured))
    return configured

  // Anything on .localhost is being served over plain http in development.
  return `${configured.endsWith('.localhost') || configured.startsWith('localhost') ? 'http' : 'https'}://${configured}`
}

const SITE_URL = siteUrl()

/**
 * The static routes, with a crawl priority and how often each really changes.
 *
 * `changefreq` and `priority` are hints rather than instructions, and search
 * engines mostly ignore them now, but they cost nothing and they document the
 * intent for whoever reads this next.
 */
const PAGES: { path: string, changefreq: string, priority: string }[] = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/menu', changefreq: 'daily', priority: '0.9' },
  { path: '/specials', changefreq: 'daily', priority: '0.9' },
  { path: '/brands', changefreq: 'weekly', priority: '0.7' },
  { path: '/delivery', changefreq: 'monthly', priority: '0.7' },
  { path: '/contact', changefreq: 'monthly', priority: '0.7' },
  { path: '/faqs', changefreq: 'monthly', priority: '0.6' },
  { path: '/story', changefreq: 'yearly', priority: '0.5' },
  { path: '/tour', changefreq: 'yearly', priority: '0.5' },
  { path: '/gift-cards', changefreq: 'monthly', priority: '0.5' },
  { path: '/careers', changefreq: 'monthly', priority: '0.4' },
  { path: '/accessibility', changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
]

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

route.get('/sitemap.xml', async () => {
  const [stores, products] = await Promise.all([
    Store.where('is_active', true).orderBy('display_order', 'asc').get(),
    Product.where('is_available', true).orderBy('name', 'asc').get(),
  ])

  const entries = [
    ...PAGES,
    ...stores.map((store: any) => ({
      path: `/stores/${store.slug}`,
      changefreq: 'monthly',
      priority: '0.8',
    })),
    /*
     * Every product on the menu.
     *
     * These are the pages worth indexing most: each one carries its own
     * structured data, its own reviews, and the long-tail search a category
     * page never answers - somebody looking for one strain by name in West LA
     * lands here or nowhere.
     *
     * Only what is actually in stock. A sold-out product's page is not
     * reachable from the menu and answers 404, and listing a 404 in a sitemap
     * is how a site teaches a crawler to trust it less.
     */
    ...products.map((product: any) => ({
      path: `/products/${product.slug}`,
      // Prices and potency move with the batch.
      changefreq: 'weekly',
      priority: '0.8',
    })),
  ]

  const lastmod = new Date().toISOString().slice(0, 10)

  const urls = entries.map(entry => [
    '  <url>',
    `    <loc>${xmlEscape(`${SITE_URL}${entry.path}`)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${entry.changefreq}</changefreq>`,
    `    <priority>${entry.priority}</priority>`,
    '  </url>',
  ].join('\n')).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

/**
 * robots.txt.
 *
 * Everything a customer sees is open. What is disallowed is the machinery
 * behind it: the bag and checkout endpoints, the signed-in pages, and the
 * delivery tracking URL, which carries a per-order token in its query string
 * and has no business in an index.
 */
route.get('/robots.txt', () => {
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    'Disallow: /api/',
    'Disallow: /track',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /dashboard',
    'Disallow: /cart',
    'Disallow: /checkout/',
    'Disallow: /orders/',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

/**
 * Choose which shop to order from.
 *
 * A plain GET that sets a cookie and sends the customer back where they were,
 * so the switcher is an ordinary link. That matters more here than it usually
 * would: picking a shop is the first thing a customer does and the last thing
 * that should depend on scripts having loaded.
 *
 * `next` is checked to be a path on this site before it is used. An open
 * redirect on a URL that sets a cookie is worth more to an attacker than most
 * — it is a working phishing hop that looks like the dispensary's own domain.
 */
route.get('/store/{slug}/choose', async (request: any) => {
  const slug = String(request.param('slug') ?? '')
  const store = await Store.where('slug', slug).where('is_active', true).first()

  const requested = String(request.query?.next ?? request.input?.('next') ?? '/menu')
  // Same-origin path only: must start with a single slash, and `//host` is a
  // protocol-relative URL to somewhere else.
  const next = /^\/(?!\/)[\w\-./?=&%]*$/.test(requested) ? requested : '/menu'

  if (!store)
    return new Response(null, { status: 302, headers: { Location: next } })

  return new Response(null, {
    status: 302,
    headers: {
      'Location': next,
      // A year: a customer's nearest dispensary does not change often, and the
      // cost of getting it wrong is one click on the switcher.
      'Set-Cookie': `erba_store=${encodeURIComponent(slug)}; Path=/; Max-Age=31536000; SameSite=Lax`,
    },
  })
})
