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
  const ua = nav.userAgent
  // iPhone/iPod carry their name in the UA. iPadOS 13+ defaults to
  // desktop-class Safari and reports a "Macintosh" UA with NO "iPad" token, so
  // a plain /ipad/ test misses every modern iPad -- detect it as a Mac UA that
  // also reports multi-touch (real Macs report maxTouchPoints === 0).
  const iOSByUA = /iphone|ipad|ipod/i.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream
  const iPadOS = /Macintosh/.test(ua) && nav.maxTouchPoints > 1
  const isIOS = iOSByUA || iPadOS
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

  // iOS/iPadOS has no install-prompt API -- Safari only installs a PWA through
  // the manual Share -> Add to Home Screen flow, which no button can trigger.
  // So on Apple devices (with no captured prompt) label the button for what it
  // actually does -- reveal the steps -- instead of promising a one-tap install
  // that silently does nothing.
  const label = !deferred && isIOS ? 'How to install' : 'Install app'

  return (
    <div className="space-y-2">
      <Button outline onClick={onClick} className="w-full justify-center">
        <Download className="size-4" /> {label}
      </Button>
      {showHelp && !deferred && (
        <p className="text-center text-xs text-zinc-500">
          {isIOS ? (
            <>
              In <span className="font-medium">Safari</span>, tap the Share icon{' '}
              <Share className="inline size-3.5 align-text-bottom" />, then{' '}
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
