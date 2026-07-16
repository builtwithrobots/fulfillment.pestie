/* Pestie Fulfillment Ops — minimal PWA service worker.
 *
 * Deliberately conservative: it ONLY caches versioned static assets
 * (Next.js build output and app icons) with stale-while-revalidate. It never
 * caches HTML documents, API responses, or anything user-specific, so a signed
 * out user can never be served another user's cached page. */

const CACHE = 'pestie-static-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/icon-') ||
      url.pathname === '/apple-touch-icon.png')
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (!isStaticAsset(url)) return // network handles everything else

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone())
          return response
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
