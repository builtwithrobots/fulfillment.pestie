import { notFound } from 'next/navigation'

import { getStationAssignmentNames } from '@/lib/floor/display'
import { verifyDisplayToken } from '@/lib/pairing/token'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { DisplayLive } from './display-live'

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

  const workers = await getStationAssignmentNames(claims.stationId)

  return <DisplayLive token={token} initialName={String(station.name ?? 'Station')} initialWorkers={workers} />
}
