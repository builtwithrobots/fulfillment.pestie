import { notFound } from 'next/navigation'

import { workerNameMap } from '@/lib/roster/data'
import { getStudyWithObservations } from '@/lib/studies/data'
import { PrintView } from './print-view'

// Lives OUTSIDE the (dashboard) route group on purpose: the sidebar shell must
// not appear on the printed page. Still Clerk-protected by the middleware (not
// a public route) and every data read validates the session.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Print study results' }

export default async function ResultsPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [data, names] = await Promise.all([getStudyWithObservations(id), workerNameMap()])
  if (!data) notFound()

  return (
    <PrintView
      study={data.study}
      steps={data.steps}
      masterRuns={data.study.useWholeTimer ? data.masterRuns : []}
      workerNames={Object.fromEntries(names)}
    />
  )
}
