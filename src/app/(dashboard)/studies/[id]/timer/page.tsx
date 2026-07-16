import { notFound } from 'next/navigation'

import { getStudyWithObservations } from '@/lib/studies/data'
import { TimerScreen } from './timer-screen'

export const metadata = { title: 'Timing' }

export default async function TimerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getStudyWithObservations(id)
  if (!data) notFound()

  return (
    <TimerScreen
      studyId={data.study.id}
      title={data.study.title}
      useWholeTimer={data.study.useWholeTimer}
      initialSteps={data.steps}
      initialMasterRuns={data.masterRuns}
    />
  )
}
