import { route } from '@stacksjs/router'

/**
 * Sign-in endpoints.
 *
 * These point at the framework's own auth actions rather than reimplementing
 * credential checking: LoginAction handles the TOTP branch, issues the
 * OAuth2-shaped token pack with a refresh token, and returns the same
 * unauthorized response for a wrong password and an unknown address, so the
 * endpoint cannot be used to enumerate accounts.
 *
 * Registered under `/api` by app/Routes.ts, so these are `/api/login` and
 * `/api/logout`. The delivery routes gate on `middleware('auth')` and accept
 * the token these mint.
 *
 * There is deliberately no public registration route. This is a dispensary
 * storefront; staff accounts are created with `./buddy account:create`.
 */
route.post('/login', 'Actions/Auth/LoginAction')
route.post('/logout', 'Actions/Auth/LogoutAction').middleware('auth')

/** Who am I: lets the login page confirm the session actually took. */
route.get('/me', 'Actions/Auth/AuthUserAction').middleware('auth')
