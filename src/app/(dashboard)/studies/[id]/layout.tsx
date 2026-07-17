import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

import { StudyTabs } from './study-tabs'

/**
 * Shared chrome for a single study: back to the list on the left, the
 * Setup | Timer | Results switcher on the right. Pages keep their own
 * headings/content below.
 */
export default async function StudyLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div>
      <div className="mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 border-b border-zinc-950/5 pb-4 dark:border-white/10">
        <Link
          href="/studies"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="size-4" /> All studies
        </Link>
        <StudyTabs studyId={id} />
      </div>
      {children}
    </div>
  )
}
