import { notFound } from 'next/navigation'

import { getPlan, getShapes, listAssignments } from '@/lib/floor/data'
import { PrintView } from './print-view'

// Lives OUTSIDE the (dashboard) route group on purpose: the sidebar shell must
// not appear on the printed page. Still Clerk-protected by the middleware (not
// a public route) and every data read validates the session.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Print floor plan' }

export default async function FloorPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const plan = await getPlan(id)
  if (!plan) notFound()

  const [shapes, assignments] = await Promise.all([getShapes(id), listAssignments()])

  return <PrintView plan={plan} shapes={shapes} assignments={assignments} />
}
