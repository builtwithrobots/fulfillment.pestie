'use client'

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect } from 'react'

import { formatNumber, type NumberFormat } from '@/lib/format'

/**
 * Shared animation layer for the app.
 *
 * Everything here honors `prefers-reduced-motion`: the dashboard runs on
 * warehouse TVs and gloved tablets, so animation is decorative only and must
 * never gate content. When reduced motion is requested, enter animations
 * collapse to a plain fade (or nothing) and counters snap to their value.
 *
 * Wrap the app in <MotionConfig reducedMotion="user"> (see application-layout)
 * so Motion's own transforms also respect the OS setting globally.
 */

const EASE = [0.22, 1, 0.36, 1] as const // gentle ease-out

/** Fade + slight rise on mount. Falls back to a pure fade when reduced. */
export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

/** Container that staggers the entrance of its <StaggerItem> children. */
export function Stagger({
  children,
  className,
  gap = 0.06,
}: {
  children: React.ReactNode
  className?: string
  gap?: number
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: reduce ? 0 : 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Count-up number. Animates from 0 → `value` on mount, formatting each frame.
 * Snaps instantly when reduced motion is requested.
 */
export function AnimatedNumber({
  value,
  format,
  duration = 0.9,
}: {
  value: number
  format?: NumberFormat
  duration?: number
}) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(reduce ? value : 0)
  const text = useTransform(mv, (n) => formatNumber(n, format))

  useEffect(() => {
    if (reduce) {
      mv.set(value)
      return
    }
    const controls = animate(mv, value, { duration, ease: EASE })
    return () => controls.stop()
  }, [mv, value, duration, reduce])

  return <motion.span>{text}</motion.span>
}
