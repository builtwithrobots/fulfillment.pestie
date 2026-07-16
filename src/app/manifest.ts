import type { MetadataRoute } from 'next'

/**
 * PWA web app manifest. Makes the app installable on mobile/desktop and gives
 * it a standalone (chrome-less) launch surface. Icons live in /public.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pestie Fulfillment Ops',
    short_name: 'Pestie Ops',
    description: 'Labor management, station productivity, shift planning, and time studies for Pestie fulfillment.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#18181b',
    theme_color: '#3b82f6',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
