import { NextResponse } from 'next/server'

import { getStationAssignmentNames } from '@/lib/floor/display'
import { verifyDisplayToken } from '@/lib/pairing/token'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * GET /display/[token]/assignments
 *
 * Public, token-scoped current staffing for a station display. The signed
 * display token is the only credential (see middleware — /display/* is public);
 * displays have no Clerk session, so they poll this instead of subscribing to
 * Realtime (which is RLS-gated to signed-in staff).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const claims = await verifyDisplayToken(decodeURIComponent(token))
  if (!claims) return NextResponse.json({ error: 'invalid token' }, { status: 401 })

  const supabase = createServiceRoleClient()
  const { data: station } = await supabase
    .from('stations')
    .select('name, token_version')
    .eq('id', claims.stationId)
    .single()
  // Reject tokens revoked by bumping the station's token_version.
  if (!station || station.token_version !== claims.tokenVersion) {
    return NextResponse.json({ error: 'revoked' }, { status: 401 })
  }

  const workers = await getStationAssignmentNames(claims.stationId)
  return NextResponse.json({ name: station.name, workers }, { headers: { 'cache-control': 'no-store' } })
}
