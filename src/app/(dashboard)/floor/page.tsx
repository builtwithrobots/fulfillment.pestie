import { LayoutGrid } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/badge'
import { Heading } from '@/components/heading'
import { listPlans } from '@/lib/floor/data'
import { formatDate } from '@/lib/format'
import { NewPlanButton, PlanRowActions } from './plan-controls'

export const metadata = { title: 'Floor layout' }

export default async function FloorPage() {
  const plans = await listPlans()

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading>Floor layout</Heading>
          <p className="mt-1 text-sm text-zinc-500">
            Lay out areas and stations on your floor plan, then tie planned headcount to each station.
          </p>
        </div>
        <NewPlanButton />
      </div>

      {plans.length === 0 ? (
        <div className="mt-8 rounded-xl bg-white p-8 text-center ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <LayoutGrid className="mx-auto size-8 text-zinc-400" />
          <p className="mt-3 text-sm text-zinc-500">No floor plans yet.</p>
          <div className="mt-4 flex justify-center">
            <NewPlanButton />
          </div>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {plans.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-4 rounded-xl bg-white p-5 ring-1 ring-zinc-950/5 sm:flex-row sm:items-center sm:justify-between sm:p-6 dark:bg-zinc-900 dark:ring-white/10"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/floor/${p.id}`}
                    className="truncate text-base font-semibold text-zinc-950 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                  >
                    {p.name}
                  </Link>
                  {p.isActive && <Badge color="green">Active</Badge>}
                  {!p.hasImage && <Badge color="zinc">No image</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                  <span>Created {formatDate(p.createdAt)}</span>
                  <span aria-hidden>·</span>
                  <span>Updated {formatDate(p.updatedAt)}</span>
                </div>
              </div>
              <PlanRowActions planId={p.id} name={p.name} isActive={p.isActive} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
