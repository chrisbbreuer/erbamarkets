import { route } from '@stacksjs/router'

/**
 * Social sign-in, on the framework's own actions.
 *
 * These are browser redirects, not API calls, so they sit at /auth/* rather
 * than under /api: the provider sends the customer's browser here, and the
 * callback hands back a session cookie plus the fragment handoff the SPA side
 * reads.
 *
 * The callback is registered for POST as well as GET because Apple mandates
 * `response_mode=form_post` whenever scopes are requested, so its reply
 * arrives as a form submission rather than a query string.
 *
 * A provider that is not fully configured 404s rather than redirecting into a
 * half-built OAuth flow. The sign-in page only renders buttons for providers
 * that are configured, so a visitor can only reach an unconfigured one by
 * guessing at the URL.
 */
route.get('/{provider}', 'Actions/Auth/SocialRedirectAction')
route.get('/{provider}/callback', 'Actions/Auth/SocialCallbackAction')
route.post('/{provider}/callback', 'Actions/Auth/SocialCallbackAction')
