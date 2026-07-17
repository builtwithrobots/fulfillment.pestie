import { ArrowLeft, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { getWorkerProfile } from '@/lib/roster/data'
import { fmtMs } from '@/lib/time-study'
import { Card, CardTitle, Stat } from '../../studies/ui'

export const metadata = { title: 'Employee profile' }

export default async function WorkerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getWorkerProfile(id)
  if (!profile) notFound()

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Heading>{profile.fullName}</Heading>
            {!profile.active && <Badge color="zinc">Inactive</Badge>}
            {profile.stationName && <Badge color="emerald">{profile.stationName}</Badge>}
          </div>
          <p className="mt-1 text-sm text-zinc-500">Measured performance across time studies.</p>
        </div>
        <Button outline href="/roster">
          <ArrowLeft className="size-4" /> Roster
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Studies" value={String(profile.totals.studies)} />
        <Stat
          label="Observations"
          value={String(profile.totals.observations)}
          tone="text-blue-600 dark:text-blue-400"
        />
        <Stat label="Full runs" value={String(profile.totals.masterRuns)} tone="text-violet-600 dark:text-violet-400" />
      </div>

      {profile.studies.length === 0 ? (
        <Card className="mt-4 text-center">
          <p className="text-sm text-zinc-500">
            No timings attributed yet. Pick this person in the timer&apos;s &ldquo;Timing&rdquo; selector while running
            a study.
          </p>
        </Card>
      ) : (
        profile.studies.map((s) => (
          <Card key={s.studyId} className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{s.studyTitle}</CardTitle>
              <Link
                href={`/studies/${s.studyId}/results`}
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400"
              >
                Study results <ArrowRight className="size-3.5" />
              </Link>
            </div>

            {s.steps.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="border-b border-zinc-950/10 text-left text-[11px] tracking-wide text-zinc-500 uppercase dark:border-white/10">
                      <th className="py-2 pr-3 font-medium">Step</th>
                      <th className="py-2 pr-3 font-medium">Avg</th>
                      <th className="py-2 pr-3 font-medium">Fastest</th>
                      <th className="py-2 pr-3 font-medium">Slowest</th>
                      <th className="py-2 font-medium">Obs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.steps.map((st) => (
                      <tr key={st.stepId} className="border-b border-zinc-950/5 dark:border-white/5">
                        <td className="py-2.5 pr-3 font-medium">{st.stepName}</td>
                        <td className="py-2.5 pr-3 font-mono tabular-nums">{fmtMs(st.avgMs)}</td>
                        <td className="py-2.5 pr-3 font-mono text-emerald-600 tabular-nums dark:text-emerald-400">
                          {fmtMs(st.minMs)}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-amber-600 tabular-nums dark:text-amber-400">
                          {fmtMs(st.maxMs)}
                        </td>
                        <td className="py-2.5">{st.obsCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {s.masterRuns && (
              <p className="mt-3 text-sm text-zinc-500">
                <span className="font-medium text-violet-600 dark:text-violet-400">Full process:</span>{' '}
                {s.masterRuns.count} run{s.masterRuns.count !== 1 ? 's' : ''}, averaging{' '}
                <span className="font-mono tabular-nums">{fmtMs(s.masterRuns.avgMs)}</span>
              </p>
            )}
          </Card>
        ))
      )}
    </div>
  )
}
