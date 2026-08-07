import type { CLI } from '@stacksjs/types'
import process from 'node:process'
import { log } from '@stacksjs/cli'
import { db } from '@stacksjs/database'
import { ExitCode } from '@stacksjs/types'

/**
 * Dispatch a real delivery, and drive it.
 *
 * `./buddy dispatch <orderId>` puts an order on a route and walks a driver
 * from the store to the customer's door, emitting a position fix every couple
 * of seconds through the same ingest path a driver's phone would use. Every
 * event, every threshold, every broadcast and every SMS fires exactly as it
 * would in production.
 *
 * This exists because the alternative way to test a tracking map is to get in
 * a car.
 */

interface DispatchOptions {
  driver?: string
  speed?: number
  interval?: number
  store?: string
}

interface Point { latitude: number, longitude: number }

/** Both ERBA rooms, as the delivery origin. */
const STORE_ORIGINS: Record<string, Point> = {
  'erba-sawtelle': { latitude: 34.0361, longitude: -118.4453 },
  'erba-west-la': { latitude: 34.0281, longitude: -118.4523 },
}

export default function (cli: CLI): void {
  cli
    .command('dispatch [orderId]', 'Put an order on a route and drive it to the door')
    .option('--driver [name]', 'Driver name, created if missing', { default: 'Marisol Okafor' })
    .option('--speed [mps]', 'Metres per second along the route', { default: 11 })
    .option('--interval [ms]', 'Milliseconds between position fixes', { default: 2000 })
    .option('--store [slug]', 'Which room the delivery leaves from', { default: 'erba-west-la' })
    .action(async (orderId: string, options: DispatchOptions) => {
      try {
        const { commerce } = await import('@stacksjs/commerce')
        const { tracking } = commerce.shippings

        const order = await resolveOrder(orderId)
        if (!order) {
          log.error('No order to dispatch. Place one on the storefront first, or pass an order id.')
          process.exit(ExitCode.FatalError)
        }

        const destination = await resolveDestination(order)
        const origin: Point = STORE_ORIGINS[String(options.store)] ?? { latitude: 34.0281, longitude: -118.4523 }
        const driver = await ensureDriver(String(options.driver), origin)
        const route = await ensureRoute(driver.id)

        log.info(`Order ${order.id} -> driver ${driver.name} on route ${route.id}`)

        const stop = await tracking.assignStop({
          deliveryRouteId: route.id,
          orderId: order.id,
          address: order.delivery_address || 'West Los Angeles',
          latitude: destination.latitude,
          longitude: destination.longitude,
          recipientName: 'Storefront customer',
          recipientPhone: order.customer_phone ?? '',
        })

        await tracking.startRoute(route.id)
        await tracking.startStop(Number(stop.id))
        log.success('Out for delivery. Watch the tracking page.')

        const speed = Number(options.speed) || 11
        const interval = Number(options.interval) || 2000
        const steps = Math.max(6, Math.round(tracking.distanceInMeters(origin, destination) / (speed * (interval / 1000))))

        for (let step = 1; step <= steps; step++) {
          const progress = step / steps
          const position = {
            latitude: origin.latitude + (destination.latitude - origin.latitude) * progress,
            longitude: origin.longitude + (destination.longitude - origin.longitude) * progress,
          }

          const result = await tracking.recordDriverPing({
            driverId: driver.id,
            ...position,
            speed,
            accuracy: 8,
          })

          const remaining = result.distanceToStopMeters ?? 0
          const eta = result.etaSeconds == null ? 'stopped' : `${Math.round(result.etaSeconds / 60)} min`
          log.info(`  ${String(step).padStart(3)}/${steps}  ${String(remaining).padStart(5)}m  eta ${eta}${result.crossedNearby ? '  [nearby]' : ''}${result.crossedArrival ? '  [arrived]' : ''}`)

          if (result.crossedArrival)
            break

          await Bun.sleep(interval)
        }

        await tracking.completeStop(Number(stop.id))
        log.success(`Delivered. Order ${order.id} is DELIVERED and the route is closed.`)
      }
      catch (error) {
        log.error('Dispatch failed')
        console.error(error)
        process.exit(ExitCode.FatalError)
      }

      process.exit(ExitCode.Success)
    })
}

interface OrderRow {
  id: number
  status: string
  delivery_address: string | null
  delivery_latitude: number | null
  delivery_longitude: number | null
  tracking_token: string | null
  customer_phone?: string | null
}

/** The named order, or the most recent one still worth delivering. */
async function resolveOrder(orderId?: string): Promise<OrderRow | null> {
  const query = db.selectFrom('orders').selectAll()

  const row = orderId
    ? await query.where('id', '=', Number(orderId)).executeTakeFirst()
    : await query.where('status', 'in', ['PENDING', 'PROCESSING', 'SHIPPED']).orderBy('id', 'desc').executeTakeFirst()

  return (row as OrderRow) ?? null
}

/**
 * Where the order is going.
 *
 * Real orders carry a geocoded destination. The storefront's checkout does not
 * ask for an address yet, so an order placed there gets a point a few minutes
 * from the store, which is what a West LA delivery actually looks like.
 */
async function resolveDestination(order: OrderRow): Promise<Point> {
  if (order.delivery_latitude != null && order.delivery_longitude != null)
    return { latitude: order.delivery_latitude, longitude: order.delivery_longitude }

  // Mar Vista, about 2.5km south west of the Pico store.
  const destination = { latitude: 34.0128, longitude: -118.4361 }

  await db
    .updateTable('orders')
    .set({
      delivery_latitude: destination.latitude,
      delivery_longitude: destination.longitude,
      delivery_address: order.delivery_address || '3821 Grand View Blvd, Los Angeles CA 90066',
      ...(order.tracking_token ? {} : { tracking_token: crypto.randomUUID().replace(/-/g, '') }),
    })
    .where('id', '=', order.id)
    .execute()

  return destination
}

async function ensureDriver(name: string, origin: Point): Promise<{ id: number, name: string }> {
  const existing = await db
    .selectFrom('drivers')
    .where('name', '=', name)
    .select(['id', 'name'])
    .executeTakeFirst() as { id: number, name: string } | undefined

  if (existing) {
    await db.updateTable('drivers').set({ status: 'on_delivery', ...origin }).where('id', '=', existing.id).execute()
    return existing
  }

  const uuid = crypto.randomUUID()
  await db
    .insertInto('drivers')
    .values({
      uuid,
      name,
      phone: '310-207-0997',
      vehicle_number: 'ERBA-04',
      license: 'CA-DL-4471902',
      status: 'on_delivery',
      latitude: origin.latitude,
      longitude: origin.longitude,
      speed: 0,
    })
    .executeTakeFirst()

  const created = await db
    .selectFrom('drivers')
    .where('uuid', '=', uuid)
    .select(['id', 'name'])
    .executeTakeFirst() as { id: number, name: string }

  return created
}

/** Reuse the driver's open route, or start a new one. */
async function ensureRoute(driverId: number): Promise<{ id: number }> {
  const open = await db
    .selectFrom('delivery_routes')
    .where('driver_id', '=', driverId)
    .where('status', 'in', ['planned', 'active'])
    .select(['id'])
    .orderBy('id', 'desc')
    .executeTakeFirst() as { id: number } | undefined

  if (open)
    return open

  const uuid = crypto.randomUUID()
  await db
    .insertInto('delivery_routes')
    .values({
      uuid,
      driver_id: driverId,
      driver: 'ERBA delivery',
      vehicle: 'ERBA-04',
      stops: 0,
      delivery_time: 45,
      total_distance: 0,
      last_active: Date.now(),
      status: 'planned',
    })
    .executeTakeFirst()

  const created = await db
    .selectFrom('delivery_routes')
    .where('uuid', '=', uuid)
    .select(['id'])
    .executeTakeFirst() as { id: number }

  return created
}
