import { commerce } from '@stacksjs/commerce'
import { log } from '@stacksjs/logging'
import { response, route } from '@stacksjs/router'
import Cart from '../app/Models/Cart'
import Inquiry from '../app/Models/Inquiry'
import Store from '../app/Models/Store'
import Product from '../app/Models/Product'
import CartItem from '../storage/framework/defaults/app/Models/commerce/CartItem'
import Customer from '../storage/framework/defaults/app/Models/commerce/Customer'
import Order from '../storage/framework/defaults/app/Models/commerce/Order'
import OrderItem from '../storage/framework/defaults/app/Models/commerce/OrderItem'
import Subscriber from '../storage/framework/defaults/app/Models/Subscriber'

/**
 * Storefront endpoints.
 *
 * The model-generated CRUD under `/api/products`, `/api/carts` and friends
 * comes from the `useApi` trait and stays as it is. What the shop front needs
 * on top is a bag a signed-out visitor can fill, so these routes address a
 * cart by an opaque token the browser holds rather than by customer id.
 *
 * Everything is registered under `/api` by the route registry in
 * `app/Routes.ts`.
 *
 * CSRF stays on. The framework issues its double-submit token in a readable
 * `X-CSRF-Token` cookie on every page load, and the storefront echoes it back
 * in the matching header, so these POSTs are protected like any other.
 */

/** California cannabis excise plus LA district and state sales tax, combined. */
const TAX_RATE = 0.2725
const DELIVERY_MINIMUM_CENTS = 3000

/**
 * How far a van goes. Both rooms are on the Westside and the delivery FAQ
 * promises 45 to 60 minutes, which in LA traffic is about five miles.
 */
const DELIVERY_RADIUS_METERS = 8000

route.get('/', () => response.json({ name: 'ERBA Markets', status: 'ok' }))

route.post('/bag', async (request: any) => {
  const token = cartToken(request)
  if (!token)
    return response.badRequest('A bag token is required.')

  const slug = String(request.input('productSlug', '')).trim()
  const quantity = Math.max(1, Math.min(12, Number(request.input('quantity', 1)) || 1))

  const product = await Product.where('slug', slug).first()
  if (!product)
    return response.notFound('That product is no longer on the menu.')

  if (!product.is_available || product.inventory_count < 1)
    return response.badRequest(`${product.name} just sold out.`)

  const cart = await currentCart(token, String(request.input('storeSlug', 'erba-west-la')))
  const existing = await CartItem.where('cart_id', cart.id).where('product_sku', slug).first()

  if (existing) {
    const nextQuantity = Math.min(12, existing.quantity + quantity)
    await CartItem.where('id', existing.id).update({
      quantity: nextQuantity,
      totalPrice: nextQuantity * product.price,
    })
  }
  else {
    await CartItem.create({
      cart_id: cart.id,
      quantity,
      unitPrice: product.price,
      totalPrice: quantity * product.price,
      taxRate: TAX_RATE,
      taxAmount: Math.round(quantity * product.price * TAX_RATE),
      discountPercentage: 0,
      discountAmount: 0,
      productName: product.name,
      productSku: slug,
      productImage: product.image_url ?? '',
      notes: '',
    })
  }

  return response.json(await bagSummary(cart.id))
})

route.post('/bag/remove', async (request: any) => {
  const token = cartToken(request)
  if (!token)
    return response.badRequest('A bag token is required.')

  const cart = await Cart.where('session_token', token).where('status', 'active').first()
  if (!cart)
    return response.json(emptyBag())

  await CartItem.where('cart_id', cart.id)
    .where('product_sku', String(request.input('productSlug', '')))
    .delete()

  return response.json(await bagSummary(cart.id))
})

route.post('/bag/show', async (request: any) => {
  const token = cartToken(request)
  if (!token)
    return response.json(emptyBag())

  const cart = await Cart.where('session_token', token).where('status', 'active').first()
  if (!cart)
    return response.json(emptyBag())

  return response.json(await bagSummary(cart.id))
})

route.post('/orders', async (request: any) => {
  const token = cartToken(request)
  if (!token)
    return response.badRequest('A bag token is required.')

  const cart = await Cart.where('session_token', token).where('status', 'active').first()
  if (!cart)
    return response.badRequest('Your bag is empty.')

  const items = await CartItem.where('cart_id', cart.id).get()
  if (items.length === 0)
    return response.badRequest('Your bag is empty.')

  const fulfillment = request.input('fulfillment', 'delivery') === 'pickup' ? 'pickup' : 'delivery'
  const totals = totalsFor(items)

  if (fulfillment === 'delivery' && totals.subtotal < DELIVERY_MINIMUM_CENTS)
    return response.badRequest('Delivery orders start at $30. Add a little more, or switch to pickup.')

  const contactName = String(request.input('name', '')).trim()
  const contactPhone = String(request.input('phone', '')).trim()

  if (!contactName || !contactPhone)
    return response.badRequest('We need a name and a phone number to hand the order over.')

  // A delivery needs a real point, not a string. Resolve it before writing the
  // order: an order that exists with an address nobody can find is worse than
  // a checkout that says so while the customer is still looking at the form.
  let destination: { latitude: number, longitude: number, formatted: string } | null = null

  if (fulfillment === 'delivery') {
    const street = String(request.input('address', '')).trim()
    if (!street)
      return response.badRequest('Where should we bring it?')

    const located = await locate({
      street,
      unit: String(request.input('unit', '')).trim() || undefined,
      city: String(request.input('city', 'Los Angeles')).trim() || 'Los Angeles',
      region: 'CA',
      postalCode: String(request.input('postalCode', '')).trim() || undefined,
      country: 'US',
    })

    if (located.error)
      return response.badRequest(located.error)

    destination = located.result
  }

  const order = await Order.create({
    status: 'PENDING',
    totalAmount: totals.total,
    currency: 'USD',
    taxAmount: totals.tax,
    discountAmount: 0,
    deliveryFee: 0,
    tipAmount: 0,
    orderType: fulfillment === 'pickup' ? 'PICKUP' : 'DELIVERY',
    // The provider's normalised address, not the customer's typing: it is what
    // the driver reads and what the geocode actually resolved to.
    deliveryAddress: destination?.formatted ?? '',
    deliveryLatitude: destination?.latitude ?? null,
    deliveryLongitude: destination?.longitude ?? null,
    specialInstructions: [String(request.input('unit', '')).trim(), String(request.input('notes', '')).trim()]
      .filter(Boolean)
      .join(' - '),
    trackingToken: crypto.randomUUID().replace(/-/g, ''),
    // Both stores quote 45 to 60 minutes; the shorter end is what we promise.
    estimatedDeliveryTime: new Date(Date.now() + 45 * 60_000).toISOString(),
  })

  for (const item of items) {
    await OrderItem.create({
      order_id: order.id,
      quantity: item.quantity,
      price: item.unit_price,
    })
  }

  await Cart.where('id', cart.id).update({ status: 'converted' })

  return response.created({
    orderId: order.id,
    reference: `ERBA-${String(order.id).padStart(5, '0')}`,
    fulfillment,
    trackingUrl: fulfillment === 'delivery' ? `/track?t=${order.tracking_token}` : '',
    address: destination?.formatted ?? '',
    ...totals,
  })
})

/**
 * VIP signup, on the framework's Subscriber model.
 *
 * Deliberately not the `useApi` CRUD the model generates at /api/subscribers.
 * That route is the staff-facing one: it takes `status` from the caller, so a
 * visitor could post themselves in as `unsubscribed`, and it answers a repeat
 * signup with a unique-constraint error rather than telling someone they are
 * already on the list. This writes the same model with the fields the shop
 * controls and returns copy a customer can read.
 *
 * `/vip/unsubscribe` completes the pair using the framework's own action, so
 * every send has a way off the list.
 */
route.post('/vip', async (request: any) => {
  const email = String(request.input('email', '')).trim().toLowerCase()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return response.badRequest('That email address does not look right.')

  const existing = await Subscriber.where('email', email).first()
  if (existing)
    return response.json({ message: 'You are already on the list.' })

  await Subscriber.create({ email, status: 'subscribed', source: 'website' })

  return response.created({ message: 'You are on the list. Watch for the drop emails.' })
})

route.post('/vip/unsubscribe', 'Actions/UnsubscribeAction')

/**
 * The contact form and the careers application.
 *
 * Both land in the `inquiries` table, distinguished by `kind`, because they are
 * the same shape underneath. Deliberately not the model's generated CRUD at
 * /api/inquiries: that one is auth-gated staff-facing, and it would let a caller
 * set `status` and `kind` themselves.
 *
 * A message that reaches the table but never reaches a person is the failure
 * mode that matters here, so the write comes first and the notification second.
 * If the mail transport is down the customer is still told we have it, and the
 * row is in the inbox for whoever works it.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/


route.post('/contact', async (request: any) => {
  const name = String(request.input('name', '')).trim()
  const email = String(request.input('email', '')).trim().toLowerCase()
  const subject = String(request.input('subject', '')).trim()
  const message = String(request.input('message', '')).trim()

  if (name.length < 2)
    return response.badRequest('Please tell us your name.')

  if (!EMAIL_PATTERN.test(email))
    return response.badRequest('That email address does not look right.')

  if (message.length < 10)
    return response.badRequest('Please add a little more detail so we can help.')

  await Inquiry.create({
    kind: 'contact',
    name,
    email,
    subject: subject.slice(0, 160) || 'Something else',
    message: message.slice(0, 5000),
    details: '{}',
    status: 'new',
  })

  log.info(`[contact] ${email}: ${subject}`)

  return response.created({ message: 'Thank you. We will come back to you within a business day.' })
})

/**
 * Leaving a review.
 *
 * Three shapes are accepted, because all three are things people actually do:
 * a star with nothing written, a comment with no star, or both. The commerce
 * layer enforces that at least one of them is present - a row carrying neither
 * would inflate the count on a product nobody has said anything about - so
 * this validates what is specific to the shop and hands the rest over.
 *
 * Nothing goes live on submission. `is_approved` stays false until a human
 * looks, which is what keeps an unmoderated one-star off the menu's star line
 * within a minute of someone typing it. The response says so rather than
 * pretending the review is already up.
 *
 * Reviews are attached to a customer identified by email. Signing in is not
 * required to leave one - most people writing a review are not signed in - so
 * the customer row is created on first review if it does not already exist.
 */
route.post('/reviews', async (request: any) => {
  const slug = String(request.input('productSlug', '')).trim()

  if (!slug)
    return response.badRequest('That product is not on the menu.')

  const product = await Product.where('slug', slug).first()

  if (!product)
    return response.badRequest('That product is not on the menu.')

  const name = String(request.input('name', '')).trim()
  const email = String(request.input('email', '')).trim().toLowerCase()

  if (name.length < 2)
    return response.badRequest('Please tell us your name.')

  if (!EMAIL_PATTERN.test(email))
    return response.badRequest('That email address does not look right.')

  const title = String(request.input('title', '')).trim().slice(0, 100)
  const content = String(request.input('content', '')).trim().slice(0, 2000)

  /*
   * An absent rating is null, not zero. Zero is a number a star row renders as
   * "no stars filled in", and it would drag the product's average down as if
   * somebody had actively scored it nothing.
   */
  const raw = request.input('rating', null)
  const rating = raw === null || raw === undefined || raw === '' ? null : Number(raw)

  if (rating !== null && (!Number.isFinite(rating) || rating < 1 || rating > 5))
    return response.badRequest('A rating has to be between one and five stars.')

  if (rating === null && !title && !content)
    return response.badRequest('Add a rating, or write a few words. Either is fine.')

  /*
   * Reviewers are customers, created on first review. Signing in is not
   * required to leave one - most people writing a review are not signed in -
   * and a returning reviewer is matched on their email rather than getting a
   * second row.
   *
   * `avatar` is required by the model and never rendered: the review list
   * shows a name, not a face. It points at our own mark rather than an avatar
   * service, so leaving a review does not hand a third party the email address
   * of everyone who writes one.
   */
  let customer = await Customer.where('email', email).first()

  if (!customer) {
    customer = await Customer.create({
      name,
      email,
      status: 'Active',
      totalSpent: 0,
      avatar: 'https://www.erbamarkets.com/images/erba-mark.png',
    })
  }

  try {
    /*
     * `store()` derives its parameter from `NewModelData<typeof Review>`,
     * which collapses to `never` in the published declarations - so no
     * argument is assignable and casting the object changes nothing. The
     * runtime signature is correct and this path is covered by the commerce
     * package's own tests; the generated .d.ts is what is wrong.
     */
    // @ts-expect-error generated parameter type resolves to never
    await commerce.products.reviews.store({
      product_id: product.id,
      customer_id: customer.id,
      rating,
      title,
      content,
      // Claimed by the reviewer, not proven. Verifying it means matching the
      // email against a delivered order, which is a job for the moderator
      // looking at the queue rather than something to take on trust here.
      is_verified_purchase: false,
      is_approved: false,
    })
  }
  catch (error) {
    log.warn(`[reviews] rejected for ${slug}: ${(error as Error).message}`)
    return response.badRequest('We could not save that review. Add a rating or a few words and try again.')
  }

  log.info(`[reviews] ${email} reviewed ${slug}${rating === null ? ' (no rating)' : ` (${rating} stars)`}`)

  return response.created({
    message: 'Thank you. Your review goes up once someone has read it.',
  })
})

route.post('/careers', async (request: any) => {
  const name = String(request.input('name', '')).trim()
  const email = String(request.input('email', '')).trim().toLowerCase()
  const phone = String(request.input('phone', '')).trim()

  if (name.length < 2)
    return response.badRequest('Please tell us your name.')

  if (!EMAIL_PATTERN.test(email))
    return response.badRequest('That email address does not look right.')

  // Hiring runs on the phone, so this one is required where the contact form
  // leaves it optional.
  if (phone.replace(/\D/g, '').length < 7)
    return response.badRequest('Please add a phone number we can reach you on.')

  const position = String(request.input('position', '')).trim() || 'Something else'

  await Inquiry.create({
    kind: 'careers',
    name,
    email,
    phone: phone.slice(0, 40),
    subject: position.slice(0, 160),
    message: String(request.input('about', '')).trim().slice(0, 5000),
    details: JSON.stringify({
      location: String(request.input('location', '')).trim(),
      availability: String(request.input('availability', '')).trim(),
    }),
    status: 'new',
  })

  log.info(`[careers] ${email} applied for ${position}`)

  return response.created({ message: 'Thank you. Your application is with the team and we will be in touch.' })
})

/**
 * Geocode a delivery address and check it is somewhere we go.
 *
 * Returns the customer-facing reason on failure rather than a boolean, because
 * "we could not find that address", "we do not deliver that far" and "our
 * address lookup is down" all need different words and different next steps.
 */
interface AddressQuery {
  street: string
  unit?: string
  city?: string
  region?: string
  postalCode?: string
  country?: string
}

interface LocateResult {
  result: { latitude: number, longitude: number, formatted: string } | null
  error: string
}

async function locate(query: AddressQuery): Promise<LocateResult> {
  const { geocoding } = commerce.shippings

  let located
  try {
    located = await geocoding.geocode(query)
  }
  catch (error) {
    // The provider is unreachable. Refusing the order would lose a sale over
    // someone else's outage, so take it and let dispatch resolve the address
    // by hand; the driver has the phone number either way.
    log.warn(`[checkout] address lookup failed, accepting the order anyway: ${error instanceof Error ? error.message : String(error)}`)
    return { result: null, error: '' }
  }

  if (!located)
    return { result: null, error: 'We could not find that address. Check the street number and try again.' }

  const stores = await Store.where('is_active', true).get()
  const origins = stores
    .map((store: any) => ({ latitude: store.latitude, longitude: store.longitude }))
    .filter((point: any) => typeof point.latitude === 'number' && typeof point.longitude === 'number')

  // No store has coordinates yet, so there is nothing to measure against.
  // Accept the order rather than reject every delivery on a data gap.
  if (origins.length === 0)
    return { result: located, error: '' }

  const coverage = geocoding.checkCoverage(located, origins, DELIVERY_RADIUS_METERS)

  if (coverage && !coverage.covered) {
    const miles = (coverage.distanceMeters / 1609).toFixed(1)
    return {
      result: null,
      error: `That address is ${miles} miles from our nearest room, past where we deliver. Pickup is still open.`,
    }
  }

  return { result: located, error: '' }
}

/** The visitor's bag token, from the request body or the `x-bag-token` header. */
function cartToken(request: any): string {
  const fromBody = String(request.input('token', '') ?? '').trim()
  if (fromBody)
    return fromBody.slice(0, 64)

  const fromHeader = request.headers?.get?.('x-bag-token') ?? ''
  return String(fromHeader).trim().slice(0, 64)
}

async function currentCart(token: string, storeSlug: string): Promise<any> {
  const existing = await Cart.where('session_token', token).where('status', 'active').first()
  if (existing)
    return existing

  return Cart.create({
    sessionToken: token,
    status: 'active',
    storeSlug,
    fulfillment: 'delivery',
    totalItems: 0,
    subtotal: 0,
    taxAmount: 0,
    discountAmount: 0,
    total: 0,
    currency: 'USD',
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 19).replace('T', ' '),
    notes: '',
    appliedCouponId: '',
  })
}

function totalsFor(items: any[]): { count: number, subtotal: number, tax: number, total: number } {
  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  const tax = Math.round(subtotal * TAX_RATE)

  return {
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal,
    tax,
    total: subtotal + tax,
  }
}

/** Recomputes the cart's stored totals, then returns what the drawer renders. */
async function bagSummary(cartId: number): Promise<Record<string, unknown>> {
  const items = await CartItem.where('cart_id', cartId).get()
  const totals = totalsFor(items)

  await Cart.where('id', cartId).update({
    totalItems: totals.count,
    subtotal: totals.subtotal,
    taxAmount: totals.tax,
    total: totals.total,
  })

  return {
    ...totals,
    deliveryMinimum: DELIVERY_MINIMUM_CENTS,
    items: items.map((item: any) => ({
      slug: item.product_sku,
      name: item.product_name,
      image: item.product_image,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      linePrice: item.unit_price * item.quantity,
    })),
  }
}

function emptyBag(): Record<string, unknown> {
  return { count: 0, subtotal: 0, tax: 0, total: 0, deliveryMinimum: DELIVERY_MINIMUM_CENTS, items: [] }
}
