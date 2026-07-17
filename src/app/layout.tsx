import '@/styles/tailwind.css'

import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata, Viewport } from 'next'

import { PwaSplash } from './pwa-splash'
import { ServiceWorkerRegister } from './service-worker-register'

export const metadata: Metadata = {
  title: {
    template: '%s - Pestie Fulfillment',
    default: 'Pestie Fulfillment',
  },
  description: 'Labor management, station productivity, and shift planning for the Pestie fulfillment warehouse.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Pestie Fulfillment',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#18181b' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

// Applies the stored theme (cookie; default light, `system` follows the OS)
// before first paint so there's no flash of the wrong theme. Kept tiny and
// inline; the React switcher keeps it in sync afterward.
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)theme=([^;]+)/);var t=m?m[1]:'light';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className="text-zinc-950 antialiased lg:bg-zinc-100 dark:bg-zinc-900 dark:text-white dark:lg:bg-zinc-950"
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
          <link rel="preconnect" href="https://rsms.me/" />
          <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
        </head>
        <body>
          {children}
          <PwaSplash />
          <ServiceWorkerRegister />
        </body>
      </html>
    </ClerkProvider>
  )
}
