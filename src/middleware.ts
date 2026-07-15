import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

import { AUTH_ENABLED } from '@/lib/auth-config'

/**
 * Routes that do NOT require a Clerk session:
 *  - /display/*          read-only station screens, gated by their own signed token
 *  - /api/pairing/pair   a screen redeems a signed code for a display token
 *  - Clerk's own sign-in / sign-up pages
 *
 * /api/pairing/code (minting) is intentionally NOT public — it stays Clerk-protected.
 */
const isPublicRoute = createRouteMatcher([
  '/display(.*)',
  '/api/pairing/pair(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
])

// clerkMiddleware always runs (so `auth()` works in server code), but it only
// enforces a login when AUTH_ENABLED. With auth disabled the whole app is open
// — see src/lib/auth-config.ts.
export default clerkMiddleware(async (auth, req) => {
  if (AUTH_ENABLED && !isPublicRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
