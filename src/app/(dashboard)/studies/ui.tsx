import clsx from 'clsx'

/**
 * Small presentational primitives shared across the Time Study screens. Uses
 * the app's global Catalyst zinc/blue theme (light + dark) — not the original
 * prototype's hardcoded dark palette.
 */

export function Card({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={clsx(
        className,
        'rounded-xl bg-white p-5 ring-1 ring-zinc-950/5 sm:p-6 dark:bg-zinc-900 dark:ring-white/10'
      )}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={clsx(
        className,
        'text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400'
      )}
      {...props}
    />
  )
}
