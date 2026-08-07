import type { CLI } from '@stacksjs/types'
import process from 'node:process'
import { register } from '@stacksjs/auth'
import { log } from '@stacksjs/cli'
import { ExitCode } from '@stacksjs/types'
import User from '../../storage/framework/defaults/app/Models/User'

/**
 * Create a staff account.
 *
 * The delivery routes are gated behind `middleware('auth')`, so dispatch and
 * the driver endpoints need a real account to sign in with. This creates one
 * through the framework's own `register`, which applies the same hashing and
 * token setup a real signup does, rather than writing a row by hand with a
 * password the login path would never match.
 *
 * Re-running with an email that already exists resets that account's password
 * instead of failing, so it doubles as the way back in after a forgotten one.
 */
export default function (cli: CLI): void {
  cli
    .command('account:create', 'Create (or reset) a staff account for signing in')
    .option('--email <email>', 'Email address to sign in with')
    .option('--password <password>', 'Password for the account')
    .option('--name <name>', 'Display name', { default: 'Staff' })
    .action(async (options: { email?: string, password?: string, name?: string }) => {
      const email = options.email
      const password = options.password

      if (!email || !password) {
        log.error('Both --email and --password are required.')
        log.info('Example: ./buddy account:create --email chris@erbamarkets.com --password "..." --name Chris')
        process.exit(ExitCode.FatalError)
      }

      try {
        const existing = await User.where('email', email).first()

        if (existing) {
          // A password set through the model goes through the same hashing
          // hook as registration, so this stays in step with the login path.
          await User.where('email', email).update({ password })
          log.success(`Reset the password for ${email}`)
          process.exit(ExitCode.Success)
        }

        const result = await register({ email, password, name: options.name || 'Staff' })

        if (!result) {
          log.error('The framework refused the registration. Has `./buddy auth:setup` been run?')
          process.exit(ExitCode.FatalError)
        }

        log.success(`Created ${email}`)
        log.info('Sign in at /login, or POST to /api/login.')
      }
      catch (error) {
        log.error('Could not create the account')
        console.error(error)
        process.exit(ExitCode.FatalError)
      }

      process.exit(ExitCode.Success)
    })
}
