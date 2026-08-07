import { db } from '@stacksjs/database'
import { log } from '@stacksjs/logging'

/**
 * Turns delivery events into messages a customer actually receives.
 *
 * Subscribed from `app/Events.ts`. Only the state changes are here: position
 * updates never reach the event bus (they go straight out over the realtime
 * channel), which is exactly why this file can send an SMS without worrying
 * about doing it four times a minute.
 *
 * SMS is the channel that matters for a delivery. A push notification needs an
 * installed app, an email is not read in the ninety seconds before a knock,
 * and every one of these customers gave us a phone number at checkout.
 */

/** The tracking link a customer opens from the message. */
function trackingUrl(token: string): string {
  const base = String(process.env.APP_URL ?? 'erbamarkets.com').replace(/^https?:\/\//, '')
  return `https://${base}/track?t=${token}`
}

interface StopContext {
  orderId: number | null
  phone: string
  trackingToken: string
  address: string
}

/**
 * Everything a message needs, from a stop.
 *
 * Prefers the phone on the stop (the driver may have been given a better
 * number) and falls back to the customer record.
 */
async function contextFor(stop: Record<string, unknown>): Promise<StopContext | null> {
  const orderId = stop.order_id == null ? null : Number(stop.order_id)
  if (!orderId)
    return null

  const order = await db
    .selectFrom('orders')
    .where('id', '=', orderId)
    .select(['id', 'tracking_token', 'customer_id', 'delivery_address'])
    .executeTakeFirst() as { id: number, tracking_token: string | null, customer_id: number | null, delivery_address: string | null } | undefined

  if (!order?.tracking_token)
    return null

  let phone = String(stop.recipient_phone ?? '')

  if (!phone && order.customer_id) {
    const customer = await db
      .selectFrom('customers')
      .where('id', '=', order.customer_id)
      .select(['phone'])
      .executeTakeFirst() as { phone: string | null } | undefined

    phone = String(customer?.phone ?? '')
  }

  return {
    orderId,
    phone,
    trackingToken: order.tracking_token,
    address: String(stop.address ?? order.delivery_address ?? ''),
  }
}

/**
 * Send, and never let a failure escape.
 *
 * A carrier outage must not roll back a delivery state change: the driver is
 * already at the door, and an exception here would leave the stop in the
 * wrong state to make a point about a text message.
 */
async function sendSms(to: string, body: string): Promise<void> {
  if (!to) {
    log.debug('[delivery] no phone number on file; skipping SMS')
    return
  }

  try {
    const mod = await import('@stacksjs/notifications').catch(() => null)
    const useSMS = (mod as { useSMS?: (driver?: string) => { send: (to: string, body: string) => Promise<unknown> } } | null)?.useSMS

    if (typeof useSMS !== 'function') {
      log.debug('[delivery] notifications package unavailable; skipping SMS')
      return
    }

    await useSMS().send(to, body)
  }
  catch (error) {
    log.warn(`[delivery] SMS send failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** The order is on a vehicle. The one message worth a link. */
export async function onDeliveryStarted(payload: { stop: Record<string, unknown> }): Promise<void> {
  const context = await contextFor(payload.stop)
  if (!context)
    return

  await sendSms(
    context.phone,
    `ERBA: your order is on the way. Follow your driver here: ${trackingUrl(context.trackingToken)}`,
  )
}

/** Within the nearby radius. Time to find your ID. */
export async function onDeliveryNearby(payload: { stop: Record<string, unknown>, etaSeconds: number | null }): Promise<void> {
  const context = await contextFor(payload.stop)
  if (!context)
    return

  const minutes = payload.etaSeconds == null ? null : Math.max(1, Math.round(payload.etaSeconds / 60))
  const when = minutes == null ? 'almost there' : `about ${minutes} min away`

  await sendSms(
    context.phone,
    `ERBA: your driver is ${when}. Please have your ID ready.`,
  )
}

/** At the door. */
export async function onDeliveryArrived(payload: { stop: Record<string, unknown> }): Promise<void> {
  const context = await contextFor(payload.stop)
  if (!context)
    return

  await sendSms(context.phone, `ERBA: your driver has arrived at ${context.address}.`)
}

/** Handed over. No link: there is nothing left to track. */
export async function onDeliveryCompleted(payload: { stop: Record<string, unknown> }): Promise<void> {
  const context = await contextFor(payload.stop)
  if (!context)
    return

  await sendSms(context.phone, 'ERBA: delivered. Thanks for shopping with us.')
}

/**
 * The drop failed.
 *
 * Tells the customer what happened and who to call, because the alternative is
 * that they keep watching a map of a van driving away.
 */
export async function onDeliveryFailed(payload: { stop: Record<string, unknown>, reason?: string }): Promise<void> {
  const context = await contextFor(payload.stop)
  if (!context)
    return

  await sendSms(
    context.phone,
    `ERBA: we could not complete your delivery${payload.reason ? ` (${payload.reason})` : ''}. Call 310-207-0997 and we will sort it out.`,
  )
}

export default {
  onDeliveryStarted,
  onDeliveryNearby,
  onDeliveryArrived,
  onDeliveryCompleted,
  onDeliveryFailed,
}
