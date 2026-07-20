import { notFound } from 'next/navigation'

import { getStudy } from '@/lib/studies/data'
import { SetupForm } from '../../setup-form'

export const metadata = { title: 'Edit study' }

export default async function EditStudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const study = await getStudy(id)
  if (!study) notFound()

  return (
    <SetupForm
      initial={{
        id: study.id,
        title: study.title,
        wageRate: study.wageRate,
        allowancePct: study.allowancePct,
        useWholeTimer: study.useWholeTimer,
        steps: study.steps.map((s) => ({ id: s.id, name: s.name, notes: s.notes, timed: s.timed })),
      }}
    />
  )
}
