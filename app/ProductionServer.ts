import process from 'node:process'
import { startProductionServer } from '@stacksjs/buddy/production-server.js'

/**
 * Production entry for the storefront.
 *
 * The deploy builds this into `storage/framework/runtime/production/serve.js`
 * and systemd runs that. It exists so the long-running web process is a single
 * minified entry rather than Buddy's general-purpose command dispatcher, while
 * the build step still resolves the workspace from source.
 */
process.env.APP_ENV ||= 'production'
process.env.NODE_ENV ||= 'production'

await startProductionServer()
