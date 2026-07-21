'use client'

import clsx from 'clsx'
import { motion } from 'motion/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { segment: 'setup', label: 'Setup' },
  { segment: 'timer', label: 'Timer' },
  { segment: 'results', label: 'Results' },
]

/**
 * Segmented Setup | Timer | Results switcher shown on every study page. The
 * active segment is a solid green pill with a spring pop-in.
 *
 * Note: the nav subtree remounts on every route change (the app-shell transition
 * in application-layout is keyed by pathname), so a shared-`layoutId` slide
 * between tabs isn't possible here — the pill settles with a scale pop-in
 * instead. Honors reduced motion via the global MotionConfig.
 */
export function StudyTabs({ studyId }: { studyId: string }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Study sections"
      className="flex gap-1 rounded-xl bg-zinc-100 p-1 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10"
    >
      {TABS.map((t) => {
        const href = `/studies/${studyId}/${t.segment}`
        const current = pathname.startsWith(href)
        return (
          <Link
            key={t.segment}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={clsx(
              'relative rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
              current ? 'text-white' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
            )}
          >
            {current && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="absolute inset-0 rounded-lg bg-green-600 shadow-sm dark:bg-green-500"
              />
            )}
            <span className="relative">{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
