import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { signPairingCode } from '@/lib/pairing/token'

/**
 * POST /api/pairing/code   { stationId }
 *
 * Admin/Supervisor mints a short-lived pairing code for a station from the
 * dashboard. Clerk-protected — NOT in the middleware public list.
 */
export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { stationId } = (await req.json().catch(() => ({}))) as { stationId?: string }
  if (!stationId) return NextResponse.json({ error: 'stationId required' }, { status: 400 })

  // TODO: authorize by role (Director/Supervisor) via RLS-backed lookup before minting.
  const code = await signPairingCode(stationId)
  return NextResponse.json({ code })
}
