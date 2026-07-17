'use client'

import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { createRosterWorker, renameWorker, setWorkerActive } from '@/lib/roster/actions'

export function AddWorkerButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function create() {
    setError(null)
    startTransition(async () => {
      const res = await createRosterWorker(name)
      if (!res.ok) return setError(res.error)
      setOpen(false)
      setName('')
      router.refresh()
    })
  }

  return (
    <>
      <Button color="blue" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add person
      </Button>
      <Dialog open={open} onClose={setOpen}>
        <DialogTitle>Add to roster</DialogTitle>
        <DialogBody>
          <Field>
            <Label>Full name</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              maxLength={80}
              placeholder="e.g. Maria Gonzalez"
            />
          </Field>
          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button color="blue" onClick={create} disabled={isPending}>
            {isPending ? 'Adding…' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export function WorkerRowActions({ workerId, name, active }: { workerId: string; name: string; active: boolean }) {
  const router = useRouter()
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function rename() {
    setError(null)
    startTransition(async () => {
      const res = await renameWorker(workerId, newName)
      if (!res.ok) return setError(res.error)
      setRenaming(false)
      router.refresh()
    })
  }

  function toggleActive() {
    startTransition(async () => {
      await setWorkerActive(workerId, !active)
      router.refresh()
    })
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button plain onClick={() => setRenaming(true)} disabled={isPending}>
        Rename
      </Button>
      <Button plain onClick={toggleActive} disabled={isPending}>
        {active ? 'Deactivate' : 'Reactivate'}
      </Button>

      <Dialog open={renaming} onClose={setRenaming}>
        <DialogTitle>Rename {name}</DialogTitle>
        <DialogBody>
          <Field>
            <Label>Full name</Label>
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && rename()}
              maxLength={80}
            />
          </Field>
          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setRenaming(false)}>
            Cancel
          </Button>
          <Button color="blue" onClick={rename} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
