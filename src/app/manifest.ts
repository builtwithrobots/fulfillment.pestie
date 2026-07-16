import type { MetadataRoute } from 'next'

/**
 * PWA web app manifest. Makes the app installable on mobile/desktop and gives
 * it a standalone (chrome-less) launch surface. Icons live in /public.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pestie Fulfillment',
    short_name: 'Pestie',
    description: 'Labor management, station productivity, shift planning, and time studies for Pestie fulfillment.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#16a34a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
