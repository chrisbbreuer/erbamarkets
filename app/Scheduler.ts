import process from 'node:process'
import { schedule } from '@stacksjs/scheduler'

/**
 * **Scheduler**
 *
 * Define your scheduled tasks here. Jobs, actions, and shell commands
 * can all be scheduled with a fluent, expressive API.
 *
 * @see https://docs.stacksjs.com/scheduling
 */
export default function () {
  // Run the Inspire job every hour
  schedule
    .job('Inspire')
    .hourly()
    .setTimeZone('America/Los_Angeles')

  /*
   * Pull the shops' inventory in overnight.
   *
   * Nightly rather than hourly: it is several hundred page loads against the
   * point of sale, nothing on the storefront waits on it — the site reads our
   * own tables — and a menu that is a few hours behind on stock is the normal
   * state of every dispensary menu on the internet. Los Angeles time so it
   * lands after close and before the shops open.
   */
  schedule
    .command('./buddy menu:sync')
    .daily()
    .at('04:00')
    .setTimeZone('America/Los_Angeles')

  // Run a custom action every five minutes
  // schedule.action('CleanupTempFiles').everyFiveMinutes()

  // Run a shell command daily at midnight
  // schedule.command('echo "Daily maintenance complete"').daily()
}

process.on('SIGINT', () => {
  schedule.gracefulShutdown().then(() => process.exit(0))
})
