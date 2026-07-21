'use client'

import { Check, Lock, X } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { updateStudyTitle } from '@/lib/studies/actions'

/**
 * Study title on the timer screen, locked by default. Tap the lock to unlock and
 * edit inline; Save (or Enter) persists via updateStudyTitle, Cancel (or Escape)
 * reverts. Keeping it locked by default avoids fat-finger renames mid-study.
 */
export function TimerTitleEditor({ studyId, initialTitle }: { studyId: string; initialTitle: string }) {
  const [title, setTitle] = useState(initialTitle)
  const [draft, setDraft] = useState(initialTitle)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function unlock() {
    setDraft(title)
    setError(null)
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
    setError(null)
  }

  function save() {
    const next = draft.trim()
    if (!next) {
      setError('Please enter a study title.')
      return
    }
    if (next === title) {
      setEditing(false)
      return
    }
    startTransition(async () => {
      const res = await updateStudyTitle(studyId, next)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setTitle(next)
      setEditing(false)
    })
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <Heading>{title}</Heading>
        <button
          type="button"
          onClick={unlock}
          aria-label="Unlock to edit the study title"
          title="Edit title"
          className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-950/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        >
          <Lock className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={80}
          autoFocus
          aria-label="Study title"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              save()
            } else if (e.key === 'Escape') {
              cancel()
            }
          }}
          className="max-w-md"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          aria-label="Save title"
          className="rounded-md p-1.5 text-green-600 transition-colors hover:bg-green-500/10 disabled:opacity-50 dark:text-green-400"
        >
          <Check className="size-5" />
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          aria-label="Cancel editing title"
          className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-950/5 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        >
          <X className="size-5" />
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
