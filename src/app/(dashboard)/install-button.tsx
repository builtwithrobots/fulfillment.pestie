'use client'

import { Check, Download, Share } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/button'

// Not in the TS DOM lib yet; Chromium fires this before the install prompt.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Client-only environment read. Returns defaults during SSR. Used as a lazy
// useState initializer so it never runs as an effect setState.
function detectEnv(): { standalone: boolean; isIOS: boolean } {
  if (typeof window === 'undefined') return { standalone: false, isIOS: false }
  const nav = window.navigator as Navigator & { standalone?: boolean }
  const standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
  const isIOS = /iphone|ipad|ipod/i.test(nav.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream
  return { standalone, isIOS }
}

/**
 * One-tap install for the PWA, shown next to the QR.
 *
 * - Chromium (Android/desktop): captures `beforeinstallprompt` and triggers the
 *   native install prompt on click.
 * - iOS Safari (no such event): the button reveals Add-to-Home-Screen steps.
 * - Already installed (standalone): shows an "installed" note instead.
 */
export function InstallButton() {
  // Lazily read the environment once (no effect setState, no hydration impact --
  // neither value changes the first paint).
  const [{ standalone, isIOS }] = useState(detectEnv)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installedByEvent, setInstalledByEvent] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const installed = standalone || installedByEvent

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalledByEvent(true)
      setDeferred(null)
      setShowHelp(false)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) {
    return (
      <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
        <Check className="size-3.5" /> App installed
      </div>
    )
  }

  async function onClick() {
    if (deferred) {
      await deferred.prompt()
      await deferred.userChoice.catch(() => undefined)
      setDeferred(null)
    } else {
      setShowHelp((v) => !v)
    }
  }

  return (
    <div className="space-y-2">
      <Button outline onClick={onClick} className="w-full justify-center">
        <Download className="size-4" /> Install app
      </Button>
      {showHelp && !deferred && (
        <p className="text-center text-xs text-zinc-500">
          {isIOS ? (
            <>
              Tap the Share icon <Share className="inline size-3.5 align-text-bottom" />, then{' '}
              <span className="font-medium">Add to Home Screen</span>.
            </>
          ) : (
            <>
              Open your browser menu and choose <span className="font-medium">Install app</span> or{' '}
              <span className="font-medium">Add to Home Screen</span>.
            </>
          )}
        </p>
      )}
    </div>
  )
}
