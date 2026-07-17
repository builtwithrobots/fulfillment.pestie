'use client'

import clsx from 'clsx'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * Light / System / Dark switcher. The choice persists in a `theme` cookie
 * (device preference, not app data) and toggles the `.dark` class on <html>;
 * a no-flash script in the root layout applies it before paint. Default light.
 */
export type Theme = 'light' | 'system' | 'dark'

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
]

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyToDom(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && prefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

export function ThemeToggle({ initialTheme = 'light' }: { initialTheme?: Theme }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  // Persist the choice and reflect it on <html>.
  useEffect(() => {
    document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Lax`
    applyToDom(theme)
  }, [theme])

  // While on "system", follow live OS changes.
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyToDom('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={clsx(
              'flex size-7 items-center justify-center rounded-md transition-colors',
              active
                ? 'bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-700 dark:text-white dark:ring-white/10'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            )}
          >
            <Icon className="size-4" />
          </button>
        )
      })}
    </div>
  )
}
