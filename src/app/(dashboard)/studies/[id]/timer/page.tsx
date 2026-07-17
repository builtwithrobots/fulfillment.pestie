import { notFound } from 'next/navigation'

import { listWorkerOptions, workerNameMap } from '@/lib/roster/data'
import { getStudyWithObservations } from '@/lib/studies/data'
import { TimerScreen } from './timer-screen'

export const metadata = { title: 'Timing' }

export default async function TimerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [data, workers, names] = await Promise.all([getStudyWithObservations(id), listWorkerOptions(), workerNameMap()])
  if (!data) notFound()

  return (
    <TimerScreen
      studyId={data.study.id}
      title={data.study.title}
      useWholeTimer={data.study.useWholeTimer}
      initialSteps={data.steps}
      initialMasterRuns={data.masterRuns}
      initialWorkers={workers}
      workerNames={Object.fromEntries(names)}
    />
  )
}
