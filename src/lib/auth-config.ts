/**
 * Auth enforcement toggle.
 *
 * TEMPORARY dev convenience: while the app is being built out, we don't want to
 * log in through Clerk on every page view. Auth is therefore OFF by default and
 * must be explicitly enabled.
 *
 *   NEXT_PUBLIC_ENABLE_AUTH=true   → Clerk protects the dashboard (normal mode)
 *   (unset / anything else)        → no login required; dashboard is open
 *
 * When auth is disabled a visible banner renders in the dashboard (see
 * AuthDisabledBanner) so this can't ship to real users unnoticed. Turn it on
 * before production use.
 *
 * NEXT_PUBLIC_ is required so the same value is available in middleware, server
 * components, and the browser.
 */
export const AUTH_ENABLED = process.env.NEXT_PUBLIC_ENABLE_AUTH === 'true'
