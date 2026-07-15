import { notFound } from 'next/navigation'

import { verifyDisplayToken } from '@/lib/pairing/token'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const metadata = { title: 'Station Display' }

// Station screens are public + read-only. They authenticate with their signed
// display token, never a Clerk session. Middleware leaves /display/* public.
export default async function StationDisplayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const claims = await verifyDisplayToken(decodeURIComponent(token))
  if (!claims) notFound()

  const supabase = createServiceRoleClient()
  const { data: station } = await supabase
    .from('stations')
    .select('id, name, token_version')
    .eq('id', claims.stationId)
    .single()

  // Reject tokens revoked by bumping the station's token_version.
  if (!station || station.token_version !== claims.tokenVersion) notFound()

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-zinc-950 text-white">
      <h1 className="text-6xl font-semibold">{String(station.name ?? 'Station')}</h1>
      <p className="mt-4 text-2xl text-zinc-400">
        Read-only display · live updates via Supabase Realtime
      </p>
    </main>
  )
}
