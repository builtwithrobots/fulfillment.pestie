'use client'

import { Info } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'

/**
 * A small info icon that opens a concise explanation in a modal. Used for the
 * "how is this calculated?" popovers on the results KPIs and to view a step's
 * notes. A modal (portaled) rather than an inline popover so it is never
 * clipped inside scrolling/overflow containers like the step-breakdown table.
 */
export function InfoModal({
  title,
  children,
  icon,
  triggerLabel,
  triggerClassName,
}: {
  title: string
  children: React.ReactNode
  icon?: React.ReactNode
  triggerLabel: string
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={triggerLabel}
        className={triggerClassName ?? 'text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-200'}
      >
        {icon ?? <Info className="size-3.5" />}
      </button>
      <Dialog open={open} onClose={setOpen} size="sm">
        <DialogTitle>{title}</DialogTitle>
        <DialogBody className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{children}</DialogBody>
        <DialogActions>
          <Button color="blue" onClick={() => setOpen(false)}>
            Got it
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
