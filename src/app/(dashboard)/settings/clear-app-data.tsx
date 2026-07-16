'use client'

import { useClerk } from '@clerk/nextjs'
import { useState } from 'react'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Text } from '@/components/text'
import { AUTH_ENABLED } from '@/lib/auth-config'

/**
 * Fully resets this browser context's copy of the PWA: unregisters the service
 * worker, deletes its caches, and clears web storage, then signs out (when auth
 * is on) and reloads. Useful for a clean reset before uninstalling, or to
 * recover from a stale cache. Note: this only affects the current context --
 * it cannot run after the app is uninstalled.
 */
async function clearClientData() {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((r) => r.unregister()))
  }
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  }
  // The app doesn't use these, but clear them defensively.
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.clear()
  } catch {
    /* ignore */
  }
}

export function ClearAppData() {
  const clerk = useClerk()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const label = AUTH_ENABLED ? 'Clear app data & sign out' : 'Clear app data'

  async function run() {
    setBusy(true)
    try {
      await clearClientData()
    } finally {
      if (AUTH_ENABLED) {
        try {
          await clerk.signOut({ redirectUrl: '/sign-in' })
        } catch {
          window.location.replace('/')
        }
      } else {
        window.location.replace('/')
      }
    }
  }

  return (
    <>
      <Button outline onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Dialog open={open} onClose={setOpen}>
        <DialogTitle>{label}?</DialogTitle>
        <DialogBody>
          <Text>
            This unregisters the app&apos;s service worker and deletes its cached files on this device, then
            {AUTH_ENABLED ? ' signs you out and' : ''} reloads a fresh copy. Your studies and data are stored in the
            cloud and are not affected. Use this for a clean reset before uninstalling, or to clear a stale cache.
          </Text>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button color="red" onClick={run} disabled={busy}>
            {busy ? 'Clearing…' : label}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
