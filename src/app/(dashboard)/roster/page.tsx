import Link from 'next/link'

import { Badge } from '@/components/badge'
import { Heading } from '@/components/heading'
import { formatDate } from '@/lib/format'
import { listRoster } from '@/lib/roster/data'
import { Card } from '../studies/ui'
import { AddWorkerButton, WorkerRowActions } from './roster-actions'

export const metadata = { title: 'Roster' }

export default async function RosterPage() {
  const roster = await listRoster()
  const active = roster.filter((w) => w.active)
  const inactive = roster.filter((w) => !w.active)

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading>Roster</Heading>
          <p className="mt-1 text-sm text-zinc-500">Employees and their measured performance across time studies.</p>
        </div>
        <AddWorkerButton />
      </div>

      {roster.length === 0 ? (
        <Card className="mt-8 text-center">
          <p className="text-sm text-zinc-500">
            Nobody on the roster yet. Add people here, or they&apos;ll appear automatically when assigned on the floor
            layout.
          </p>
        </Card>
      ) : (
        <>
          <ul className="mt-8 space-y-3">
            {active.map((w) => (
              <RosterCard key={w.id} worker={w} />
            ))}
          </ul>
          {inactive.length > 0 && (
            <>
              <h2 className="mt-8 text-xs font-semibold tracking-wider text-zinc-500 uppercase">Inactive</h2>
              <ul className="mt-3 space-y-3">
                {inactive.map((w) => (
                  <RosterCard key={w.id} worker={w} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}

function RosterCard({ worker: w }: { worker: Awaited<ReturnType<typeof listRoster>>[number] }) {
  const hasTimings = w.observationCount > 0 || w.masterRunCount > 0
  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/roster/${w.id}`}
            className="truncate text-base font-semibold text-zinc-950 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
          >
            {w.fullName}
          </Link>
          {!w.active && <Badge color="zinc">Inactive</Badge>}
          {w.stationName && <Badge color="emerald">{w.stationName}</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
          {hasTimings ? (
            <>
              <span>
                {w.observationCount} observation{w.observationCount !== 1 ? 's' : ''}
              </span>
              <span aria-hidden>·</span>
              <span>
                {w.masterRunCount} full run{w.masterRunCount !== 1 ? 's' : ''}
              </span>
              {w.lastTimedAt && (
                <>
                  <span aria-hidden>·</span>
                  <span>Last timed {formatDate(w.lastTimedAt)}</span>
                </>
              )}
            </>
          ) : (
            <span>No timings recorded yet</span>
          )}
        </div>
      </div>
      <WorkerRowActions workerId={w.id} name={w.fullName} active={w.active} />
    </Card>
  )
}
