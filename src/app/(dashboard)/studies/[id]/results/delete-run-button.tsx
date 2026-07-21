'use client'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { deleteMasterRun } from '@/lib/studies/actions'

/**
 * Trash button on a master-timer run that opens an "are you sure?" modal, then
 * deletes the run and refreshes the results so the averages, spread, and
 * consistency band recompute. Used to drop a mis-timed run that is skewing the
 * numbers.
 */
export function DeleteRunButton({
  studyId,
  runId,
  label,
  time,
}: {
  studyId: string
  runId: string
  label: string
  time: string
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function confirmDelete() {
    setError(null)
    startTransition(async () => {
      const res = await deleteMasterRun(studyId, runId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${label} (${time})`}
        className="rounded p-1 text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
      >
        <Trash2 className="size-4" />
      </button>
      <Dialog open={open} onClose={setOpen} size="sm">
        <DialogTitle>Delete {label}?</DialogTitle>
        <DialogBody className="text-sm text-zinc-600 dark:text-zinc-300">
          This removes the <span className="font-mono font-medium">{time}</span>{' '}
          full-process run from this study. The average, fastest/slowest, standard deviation, and consistency band all
          recalculate. This can&apos;t be undone.
          {error && <span className="mt-2 block text-red-600 dark:text-red-400">Couldn&apos;t delete: {error}</span>}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button color="red" onClick={confirmDelete} disabled={pending}>
            {pending ? 'Deleting…' : 'Delete run'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
