import { response, route } from '@stacksjs/router'
import Cart from '../app/Models/Cart'
import Product from '../app/Models/Product'
import CartItem from '../storage/framework/defaults/app/Models/commerce/CartItem'
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

  const order = await Order.create({
    status: 'PENDING',
    totalAmount: totals.total,
    currency: 'USD',
    taxAmount: totals.tax,
    discountAmount: 0,
    deliveryFee: 0,
    tipAmount: 0,
    orderType: fulfillment === 'pickup' ? 'PICKUP' : 'DELIVERY',
    deliveryAddress: String(request.input('address', '')),
    specialInstructions: String(request.input('notes', '')),
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
    ...totals,
  })
})

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
