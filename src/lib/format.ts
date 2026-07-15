/**
 * Serializable number formatting shared across the server/client boundary.
 *
 * KPI values animate on the client (AnimatedNumber), so the formatter must be
 * describable as plain data — functions can't be passed from a Server Component
 * to a Client Component.
 */
export type NumberFormat =
  | { kind: 'number' }
  | { kind: 'percent' }
  | { kind: 'ratio'; denominator: number }

export function formatNumber(n: number, fmt: NumberFormat = { kind: 'number' }): string {
  const r = Math.round(n)
  switch (fmt.kind) {
    case 'percent':
      return `${r}%`
    case 'ratio':
      return `${r} / ${fmt.denominator}`
    default:
      return r.toLocaleString()
  }
}
