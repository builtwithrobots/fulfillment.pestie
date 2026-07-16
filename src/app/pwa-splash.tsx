'use client'

import { BugOff } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * Brief branded launch splash for the installed PWA: a green screen with the
 * bug-off mark, "Pestie" large, and "Fulfillment" centered beneath. It shows
 * ONLY when the app is launched in standalone/fullscreen display mode (i.e.
 * from the home screen), never in a normal browser tab, and only on a cold
 * start (it is mounted once in the root layout, so client-side navigations do
 * not retrigger it). Purely decorative -- aria-hidden, and it removes itself
 * after ~1.2s so it can never block the app.
 */
export function PwaSplash() {
  const [phase, setPhase] = useState<'hidden' | 'shown' | 'leaving'>('hidden')

  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: fullscreen)').matches ||
      // iOS Safari home-screen apps
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (!standalone) return

    // Deferred so no state is set synchronously inside the effect.
    const show = setTimeout(() => setPhase('shown'), 0)
    const leave = setTimeout(() => setPhase('leaving'), 1200)
    const done = setTimeout(() => setPhase('hidden'), 1550)
    return () => {
      clearTimeout(show)
      clearTimeout(leave)
      clearTimeout(done)
    }
  }, [])

  if (phase === 'hidden') return null

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#16a34a] transition-opacity duration-300 motion-reduce:transition-none ${
        phase === 'leaving' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <BugOff className="size-20 text-white" strokeWidth={1.75} />
      <div className="mt-5 text-5xl font-bold tracking-tight text-white">Pestie</div>
      <div className="mt-2 text-base font-medium tracking-wide text-white/80">Fulfillment</div>
    </div>
  )
}
