'use client'

import { useEffect } from 'react'

/**
 * Registers the PWA service worker (public/sw.js) once on the client. Rendered
 * near the root so every route participates in installability. Registration is
 * best-effort — any failure is swallowed so it can never block the app.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {})
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
