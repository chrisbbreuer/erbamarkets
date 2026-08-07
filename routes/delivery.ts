import { commerce } from '@stacksjs/commerce'
import { db } from '@stacksjs/database'
import { response, route } from '@stacksjs/router'

/**
 * Delivery: the driver's side and the customer's side.
 *
 * Registered at `/delivery/*` by `app/Routes.ts`. The heavy lifting
 * (persisting the fix, moving the driver, recomputing the ETA, broadcasting,
 * latching the nearby and arrived thresholds) is `commerce.shippings.tracking`
 * so it behaves the same in every Stacks app; this file is the transport and
 * the authorisation around it.
 *
 * Two different callers, two different authorisation models:
 *
 *   - Drivers post positions and move stops. Staff-authenticated, because a
 *     driver is a member of the team.
 *   - Customers read one order's tracking state, from a phone, not signed in,
 *     off a link in a text message. That authorises on possession of the
 *     order's `trackingToken` and returns only what a map needs: it never
 *     exposes the driver's phone, the route, or the other stops on it.
 */

const { tracking } = commerce.shippings

/** Metres of precision published to customers. */
const CUSTOMER_POSITION_PRECISION = 5

route.post('/ping', async (request: any) => {
  const driverId = Number(request.input('driverId', 0))
  const latitude = Number(request.input('latitude', Number.NaN))
  const longitude = Number(request.input('longitude', Number.NaN))

  if (!driverId || !Number.isFinite(latitude) || !Number.isFinite(longitude))
    return response.badRequest('driverId, latitude and longitude are required.')

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)
    return response.badRequest('Those coordinates are not on Earth.')

  const result = await tracking.recordDriverPing({
    driverId,
    latitude,
    longitude,
    heading: numberOrNull(request.input('heading', null)),
    speed: numberOrNull(request.input('speed', null)),
    accuracy: numberOrNull(request.input('accuracy', null)),
    recordedAt: request.input('recordedAt', undefined) || undefined,
  })

  return response.json(result)
}).middleware('auth')

route.post('/stops/{id}/start', async (request: any) => {
  const stop = await tracking.startStop(Number(request.param('id')))
  return stop ? response.json(stop) : response.notFound('No such stop.')
}).middleware('auth')

route.post('/stops/{id}/complete', async (request: any) => {
  const stop = await tracking.completeStop(
    Number(request.param('id')),
    String(request.input('notes', '')) || undefined,
  )
  return stop ? response.json(stop) : response.notFound('No such stop.')
}).middleware('auth')

route.post('/stops/{id}/fail', async (request: any) => {
  const reason = String(request.input('reason', '')).trim()
  if (!reason)
    return response.badRequest('A failed stop needs a reason.')

  const stop = await tracking.failStop(Number(request.param('id')), reason)
  return stop ? response.json(stop) : response.notFound('No such stop.')
}).middleware('auth')

/**
 * Everything the customer's tracking page renders, in one call.
 *
 * Also the endpoint the page falls back to when the websocket cannot connect:
 * polling this every 20 seconds is a worse experience than a live channel and
 * a much better one than a map that never moves.
 */
route.get('/track/{token}', async (request: any) => {
  const state = await trackingState(String(request.param('token')))

  return state ? response.json(state) : response.notFound('We could not find that order.')
})

function numberOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Resolve a tracking token into the public view of a delivery.
 *
 * Coordinates are rounded to roughly a metre. Publishing a driver's raw fix to
 * anyone holding a link is more precision than the use case needs, and the
 * map cannot render the difference.
 */
async function trackingState(token: string): Promise<Record<string, unknown> | null> {
  if (!token || token.length > 64)
    return null

  const order = await db
    .selectFrom('orders')
    .where('tracking_token', '=', token)
    .select(['id', 'status', 'order_type', 'delivery_address', 'delivery_latitude', 'delivery_longitude', 'estimated_delivery_time', 'total_amount'])
    .executeTakeFirst() as OrderRow | undefined

  if (!order)
    return null

  const stop = await db
    .selectFrom('delivery_stops')
    .where('order_id', '=', order.id)
    .select(['id', 'status', 'sequence', 'address', 'latitude', 'longitude', 'eta_at', 'arrived_at', 'completed_at', 'delivery_route_id'])
    .orderBy('id', 'desc')
    .executeTakeFirst() as StopRow | undefined

  // Two selects rather than a join: the route is only ever needed for its
  // driver id, and this reads the same on every dialect.
  const route = stop?.delivery_route_id == null
    ? null
    : await db
        .selectFrom('delivery_routes')
        .where('id', '=', stop.delivery_route_id)
        .select(['driver_id'])
        .executeTakeFirst() as { driver_id: number | null } | undefined

  const driver = route?.driver_id == null
    ? null
    : await db
        .selectFrom('drivers')
        .where('id', '=', route.driver_id)
        .select(['name', 'vehicle_number', 'latitude', 'longitude', 'heading', 'last_ping_at'])
        .executeTakeFirst() as DriverRow | undefined

  // The driver's live position is only anyone's business while the order is
  // actually moving. Before dispatch and after handover the map shows the
  // destination alone.
  const isLive = stop?.status === 'en_route' || stop?.status === 'arrived'

  return {
    order: {
      id: order.id,
      status: order.status,
      type: order.order_type,
      total: order.total_amount,
    },
    destination: {
      address: stop?.address ?? order.delivery_address ?? '',
      latitude: round(order.delivery_latitude ?? stop?.latitude ?? null),
      longitude: round(order.delivery_longitude ?? stop?.longitude ?? null),
    },
    stop: stop
      ? {
          status: stop.status,
          etaAt: stop.eta_at,
          arrivedAt: stop.arrived_at,
          completedAt: stop.completed_at,
        }
      : null,
    driver: driver && isLive
      ? {
          // First name only. The customer needs to recognise who is at the
          // door, not to be handed a full identity.
          name: String(driver.name ?? '').split(' ')[0] ?? '',
          vehicle: driver.vehicle_number,
          latitude: round(driver.latitude),
          longitude: round(driver.longitude),
          heading: driver.heading,
          lastPingAt: driver.last_ping_at,
        }
      : null,
    channel: tracking.orderTrackingChannel(order.id),
  }
}

function round(value: number | null | undefined): number | null {
  return value == null ? null : Number(value.toFixed(CUSTOMER_POSITION_PRECISION))
}

interface OrderRow {
  id: number
  status: string
  order_type: string | null
  delivery_address: string | null
  delivery_latitude: number | null
  delivery_longitude: number | null
  estimated_delivery_time: string | null
  total_amount: number
}

interface StopRow {
  id: number
  status: string
  sequence: number
  address: string
  latitude: number | null
  longitude: number | null
  eta_at: string | null
  arrived_at: string | null
  completed_at: string | null
  delivery_route_id: number | null
}

interface DriverRow {
  name: string | null
  vehicle_number: string | null
  latitude: number | null
  longitude: number | null
  heading: number | null
  last_ping_at: string | null
}
