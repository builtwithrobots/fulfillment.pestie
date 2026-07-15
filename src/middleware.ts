import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

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

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
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
