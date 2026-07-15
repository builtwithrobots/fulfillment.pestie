import { NextResponse } from 'next/server'

import { signDisplayToken, verifyDisplayToken } from '@/lib/pairing/token'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * POST /api/pairing/pair   { code }
 *
 * A station screen redeems a short-lived pairing code for a permanent,
 * station-scoped display token. Public — a valid signed code is the only
 * credential a screen has (see middleware).
 */
export async function POST(req: Request) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string }
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })

  const claims = await verifyDisplayToken(code)
  if (!claims) return NextResponse.json({ error: 'invalid or expired code' }, { status: 401 })

  const supabase = createServiceRoleClient()
  const { data: station } = await supabase
    .from('stations')
    .select('id, token_version')
    .eq('id', claims.stationId)
    .single()
  if (!station) return NextResponse.json({ error: 'station not found' }, { status: 404 })

  const token = await signDisplayToken({
    stationId: station.id as string,
    tokenVersion: station.token_version as number,
  })
  return NextResponse.json({ token })
}
