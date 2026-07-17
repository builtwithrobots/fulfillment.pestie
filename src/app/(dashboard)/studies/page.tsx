import { Plus } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { formatDate } from '@/lib/format'
import { listStudies } from '@/lib/studies/data'
import { StudyRowActions } from './study-actions'
import { Card } from './ui'

export const metadata = { title: 'Time studies' }

export default async function StudiesPage() {
  const studies = await listStudies()

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading>Time studies</Heading>
          <p className="mt-1 text-sm text-zinc-500">Observe, time, and cost your operational processes.</p>
        </div>
        <Button color="blue" href="/studies/new">
          <Plus className="size-4" /> New study
        </Button>
      </div>

      {studies.length === 0 ? (
        <Card className="mt-8 text-center">
          <p className="text-sm text-zinc-500">No studies yet.</p>
          <Button color="blue" href="/studies/new" className="mt-4">
            <Plus className="size-4" /> Create your first study
          </Button>
        </Card>
      ) : (
        <ul className="mt-8 space-y-3">
          {studies.map((s) => (
            <Card key={s.id} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link
                  href={`/studies/${s.id}/timer`}
                  className="truncate text-base font-semibold text-zinc-950 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                >
                  {s.title}
                </Link>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                  <span>
                    {s.stepCount} step{s.stepCount !== 1 ? 's' : ''}
                  </span>
                  <span aria-hidden>·</span>
                  <span>Created {formatDate(s.createdAt)}</span>
                  <span aria-hidden>·</span>
                  <span>Updated {formatDate(s.updatedAt)}</span>
                </div>
                <div className="mt-2 flex gap-3 text-xs">
                  <Link
                    href={`/studies/${s.id}/setup`}
                    className="text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    Edit setup
                  </Link>
                  <Link
                    href={`/studies/${s.id}/results`}
                    className="text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    View results
                  </Link>
                </div>
              </div>
              <StudyRowActions studyId={s.id} title={s.title} />
            </Card>
          ))}
        </ul>
      )}
    </div>
  )
}
