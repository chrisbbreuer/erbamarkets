import type { SearchEngineConfig } from '@stacksjs/types'
import { env } from '@stacksjs/env'

/**
 * **Search Engine Options**
 *
 * Typesense, because that is what the deployed box already runs: pantry
 * installs it and manages it as a service (`pantry-typesense.service`), bound
 * to 127.0.0.1:8108 with its key in /etc/typesense/typesense.env. Running the
 * same engine locally is one command, `pantry start typesense`, so dev and
 * production search the same way.
 *
 * The menu falls back to querying the database directly when the engine is
 * unreachable, so a search outage degrades to slower search rather than an
 * empty menu.
 */
export default {
  driver: 'typesense',

  typesense: {
    host: env.TYPESENSE_HOST || '127.0.0.1',
    port: Number(env.TYPESENSE_PORT || 8108),
    protocol: env.TYPESENSE_PROTOCOL || 'http',
    apiKey: env.TYPESENSE_API_KEY || '',
  },
} satisfies SearchEngineConfig
