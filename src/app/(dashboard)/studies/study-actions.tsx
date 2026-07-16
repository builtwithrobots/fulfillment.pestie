'use client'

import { useRouter } from 'next/navigation'
import { Copy, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { deleteStudy, duplicateStudy } from '@/lib/studies/actions'

export function StudyRowActions({ studyId, title }: { studyId: string; title: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)

  function onDuplicate() {
    startTransition(async () => {
      const res = await duplicateStudy(studyId)
      if (res.ok) router.push(`/studies/${res.data.id}/setup`)
    })
  }

  function onDelete() {
    startTransition(async () => {
      await deleteStudy(studyId)
      setConfirmOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        <Button outline href={`/studies/${studyId}/timer`}>
          Open
        </Button>
        <Button plain onClick={onDuplicate} disabled={isPending} aria-label="Duplicate study">
          <Copy className="size-4" />
          <span className="max-sm:sr-only">Duplicate</span>
        </Button>
        <Button plain onClick={() => setConfirmOpen(true)} aria-label="Delete study">
          <Trash2 className="size-4 text-red-500" />
          <span className="max-sm:sr-only">Delete</span>
        </Button>
      </div>

      <Dialog open={confirmOpen} onClose={setConfirmOpen}>
        <DialogTitle>Delete study?</DialogTitle>
        <DialogBody>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            &ldquo;{title}&rdquo; and all of its steps, observations, and master runs will be permanently deleted.
            This cannot be undone.
          </p>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setConfirmOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button color="red" onClick={onDelete} disabled={isPending}>
            {isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
