'use client'

import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { createPlan, deletePlan, setActivePlan } from '@/lib/floor/actions'

export function NewPlanButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function create() {
    setError(null)
    startTransition(async () => {
      const res = await createPlan(name)
      if (!res.ok) return setError(res.error)
      setOpen(false)
      setName('')
      router.push(`/floor/${res.data.id}`)
    })
  }

  return (
    <>
      <Button color="blue" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New plan
      </Button>
      <Dialog open={open} onClose={setOpen}>
        <DialogTitle>New floor plan</DialogTitle>
        <DialogBody>
          <Field>
            <Label>Plan name</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              maxLength={80}
              placeholder="e.g. Main warehouse — day shift"
            />
          </Field>
          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button color="blue" onClick={create} disabled={isPending}>
            {isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export function PlanRowActions({ planId, name, isActive }: { planId: string; name: string; isActive: boolean }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  function activate() {
    startTransition(async () => {
      await setActivePlan(planId)
      router.refresh()
    })
  }

  function remove() {
    startTransition(async () => {
      await deletePlan(planId)
      setConfirming(false)
      router.refresh()
    })
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button outline href={`/floor/${planId}`}>
        Open
      </Button>
      {!isActive && (
        <Button plain onClick={activate} disabled={isPending}>
          Set active
        </Button>
      )}
      <Button plain onClick={() => setConfirming(true)} disabled={isPending}>
        Delete
      </Button>

      <Dialog open={confirming} onClose={setConfirming}>
        <DialogTitle>Delete floor plan</DialogTitle>
        <DialogBody>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Delete <span className="font-medium">{name}</span> and all of its shapes? This cannot be undone.
          </p>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button color="red" onClick={remove} disabled={isPending}>
            {isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
