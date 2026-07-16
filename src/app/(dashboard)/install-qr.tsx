import { QRCodeSVG } from 'qrcode.react'

/**
 * A QR code pointing at this deployment's Time Study app (`/studies`). The
 * origin is resolved from request headers in the server layout and passed in,
 * so it always matches wherever the app is served (local, preview, or
 * production) with no hardcoded domain and no client-only window read.
 *
 * Users scan it to open the app on their phone and "Add to Home Screen" (it is
 * an installable PWA). The QR is always dark-on-white regardless of theme so it
 * stays scannable.
 */
export function InstallQR({ origin }: { origin: string }) {
  const url = origin ? `${origin}/studies` : ''

  return (
    <div className="flex flex-col items-center gap-2 py-1">
      <div className="rounded-lg bg-white p-2 ring-1 ring-zinc-950/10">
        {url ? (
          <QRCodeSVG value={url} size={112} marginSize={0} className="h-28 w-28" />
        ) : (
          <div className="size-28" aria-hidden />
        )}
      </div>
      <span className="text-center text-xs text-zinc-500">Scan to install on your phone</span>
    </div>
  )
}
