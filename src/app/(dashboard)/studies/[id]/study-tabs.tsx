'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { segment: 'setup', label: 'Setup' },
  { segment: 'timer', label: 'Timer' },
  { segment: 'results', label: 'Results' },
]

/** Segmented Setup | Timer | Results switcher shown on every study page. */
export function StudyTabs({ studyId }: { studyId: string }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Study sections" className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-white/5">
      {TABS.map((t) => {
        const href = `/studies/${studyId}/${t.segment}`
        const current = pathname.startsWith(href)
        return (
          <Link
            key={t.segment}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={clsx(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              current
                ? 'bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-800 dark:text-white dark:ring-white/10'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
