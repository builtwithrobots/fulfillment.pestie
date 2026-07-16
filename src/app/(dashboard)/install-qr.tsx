import { QRCodeSVG } from 'qrcode.react'

import { InstallButton } from './install-button'

/**
 * A QR code pointing at this deployment's dashboard root (`/`), so scanning it
 * opens the full app -- the whole sidebar menu -- on a phone. Access is still
 * governed by the user's own rights: with auth enabled the target routes
 * through Clerk sign-in first, so each person sees only what they're allowed to.
 *
 * The origin is resolved from request headers in the server layout and passed
 * in, so it always matches wherever the app is served (local, preview, or
 * production) with no hardcoded domain and no client-only window read. Users
 * "Add to Home Screen" from there (it is an installable PWA). The QR is always
 * dark-on-white regardless of theme so it stays scannable.
 */
export function InstallQR({ origin }: { origin: string }) {
  const url = origin ? `${origin}/` : ''

  return (
    <div className="flex flex-col items-center gap-2 py-1">
      <div className="rounded-lg bg-white p-2 ring-1 ring-zinc-950/10">
        {url ? (
          <QRCodeSVG value={url} size={112} marginSize={0} className="h-28 w-28" />
        ) : (
          <div className="size-28" aria-hidden />
        )}
      </div>
      <span className="text-center text-xs text-zinc-500">Scan to open the dashboard on your phone</span>
      {/* One-tap install on this device (Android/desktop prompt; iOS shows steps). */}
      <div className="w-full">
        <InstallButton />
      </div>
    </div>
  )
}
