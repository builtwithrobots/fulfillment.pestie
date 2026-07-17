'use client'

import { Plus, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import {
  createRosterWorker,
  importRosterCsv,
  renameWorker,
  type RosterImportSummary,
  setWorkerActive,
} from '@/lib/roster/actions'

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
      if (res.similarNames.length > 0) {
        // Added, but flag likely re-spellings so the user can merge/rename.
        setError(`Added. Heads up — similar name(s) already on the roster: ${res.similarNames.join(', ')}.`)
      }
      setName('')
      if (res.similarNames.length === 0) setOpen(false)
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

export function ImportCsvButton() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<RosterImportSummary | null>(null)
  const [isPending, startTransition] = useTransition()

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setError(null)
    const form = new FormData()
    form.set('file', file)
    startTransition(async () => {
      const res = await importRosterCsv(form)
      if (!res.ok) return setError(res.error)
      setSummary(res.data)
      router.refresh()
    })
  }

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onPick} />
      <Button outline onClick={() => fileRef.current?.click()} disabled={isPending}>
        <Upload className="size-4" /> {isPending ? 'Importing…' : 'Import CSV'}
      </Button>

      {/* Error dialog */}
      <Dialog open={!!error} onClose={() => setError(null)}>
        <DialogTitle>Import failed</DialogTitle>
        <DialogBody>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{error}</p>
        </DialogBody>
        <DialogActions>
          <Button color="blue" onClick={() => setError(null)}>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Summary dialog */}
      <Dialog open={!!summary} onClose={() => setSummary(null)}>
        <DialogTitle>Import complete</DialogTitle>
        <DialogBody>
          {summary && (
            <div className="space-y-3 text-sm">
              <p className="text-zinc-600 dark:text-zinc-300">
                Added{' '}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{summary.added.length}</span> new
                employee{summary.added.length !== 1 ? 's' : ''}
                {summary.duplicates.length > 0 && (
                  <>
                    , skipped{' '}
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      {summary.duplicates.length}
                    </span>{' '}
                    already on the roster
                  </>
                )}
                {summary.blankRows > 0 && (
                  <>
                    {' '}
                    ({summary.blankRows} blank row{summary.blankRows !== 1 ? 's' : ''} ignored)
                  </>
                )}
                .
              </p>
              {summary.added.length > 0 && (
                <div>
                  <div className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">Added</div>
                  <p className="mt-1 text-zinc-600 dark:text-zinc-300">{summary.added.join(', ')}</p>
                </div>
              )}
              {summary.duplicates.length > 0 && (
                <div>
                  <div className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
                    Skipped (already on roster)
                  </div>
                  <p className="mt-1 text-zinc-500">{summary.duplicates.join(', ')}</p>
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogActions>
          <Button color="blue" onClick={() => setSummary(null)}>
            Done
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
