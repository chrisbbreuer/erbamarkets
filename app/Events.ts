import type { Events } from '@stacksjs/types'

/**
 * **Events Configuration**
 *
 * `eventName: ['Listener']` — listeners resolve from `app/Listeners/`.
 *
 * Note what is NOT here: `delivery:position`. A driver's device reports every
 * few seconds and that update goes straight out over the realtime channel to
 * the browsers watching. Putting it on the event bus would wake every listener
 * in the application several times a minute per active delivery.
 */
export default {
  'user:registered': ['SendWelcomeEmail'],
  'user:created': ['NotifyUser'],

  // Delivery lifecycle. Each one is a message the customer actually wants.
  'delivery:started': ['DeliveryNotifications.onDeliveryStarted'],
  'delivery:nearby': ['DeliveryNotifications.onDeliveryNearby'],
  'delivery:arrived': ['DeliveryNotifications.onDeliveryArrived'],
  'delivery:completed': ['DeliveryNotifications.onDeliveryCompleted'],
  'delivery:failed': ['DeliveryNotifications.onDeliveryFailed'],
} satisfies Events
