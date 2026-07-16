/* Pestie Fulfillment Ops — minimal PWA service worker.
 *
 * Caches ONLY Next.js build output under /_next/static/, which is
 * content-hashed and immutable: a new deploy ships new filenames, so cached
 * entries can never go stale or serve an "old view".
 *
 * It deliberately does NOT cache icons, the manifest, HTML documents, or API
 * responses. Icons are mutable (the app has been rebranded), so caching them
 * would pin an old home-screen/tab icon after an update — everything except
 * hashed chunks is always fetched fresh from the network.
 *
 * The cache name is versioned; bump it to force every client to drop the old
 * cache on the next activation. */

const CACHE = 'pestie-static-v2'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // Drop every cache that isn't the current version (purges v1, which used
      // to hold now-stale icons).
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

function isImmutableAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (!isImmutableAsset(url)) return // network handles everything else (icons, HTML, API)

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
