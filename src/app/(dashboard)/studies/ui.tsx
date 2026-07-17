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
        'rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 sm:p-6 dark:bg-zinc-900 dark:ring-white/10'
      )}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={clsx(className, 'text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400')}
      {...props}
    />
  )
}

/** Small mono KPI tile used on the results and roster-profile screens. */
export function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 p-4 text-center ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10">
      <div className={`font-mono text-xl font-bold tabular-nums ${tone ?? 'text-zinc-950 dark:text-white'}`}>
        {value}
      </div>
      <div className="mt-1 text-[11px] tracking-wide text-zinc-500 uppercase">{label}</div>
    </div>
  )
}
