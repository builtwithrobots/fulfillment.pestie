'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResult } from '@/lib/action-result'
import { requireUserId } from '@/lib/studies/data'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * Mutations for the employee roster. Shared operational data — any signed-in
 * leadership user can manage the roster (the floor builder's own createWorker
 * keeps its supervisor gate; this module is the roster tab + timer picker
 * path). Every action validates the Clerk session before writing through the
 * service-role client.
 */

export async function createRosterWorker(fullName: string): Promise<ActionResult<{ id: string; fullName: string }>> {
  await requireUserId()
  const clean = fullName.trim()
  if (!clean) return { ok: false, error: 'Please enter a name.' }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('workers').insert({ full_name: clean }).select('id').single()
  if (error) return { ok: false, error: error.message }

  revalidatePath('/roster')
  return { ok: true, data: { id: data.id, fullName: clean } }
}

export async function renameWorker(workerId: string, fullName: string): Promise<ActionResult> {
  await requireUserId()
  const clean = fullName.trim()
  if (!clean) return { ok: false, error: 'Please enter a name.' }

  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('workers').update({ full_name: clean }).eq('id', workerId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/roster')
  revalidatePath(`/roster/${workerId}`)
  return { ok: true }
}

/**
 * Deactivate keeps the row (and every attributed timing) but hides the worker
 * from pickers; reactivate brings them back. Deactivating also clears any
 * station assignment so displays stop showing them.
 */
export async function setWorkerActive(workerId: string, active: boolean): Promise<ActionResult> {
  await requireUserId()
  const supabase = createServiceRoleClient()

  if (!active) {
    const { error: clearError } = await supabase.from('station_assignments').delete().eq('worker_id', workerId)
    if (clearError) return { ok: false, error: clearError.message }
  }
  const { error } = await supabase.from('workers').update({ active }).eq('id', workerId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/roster')
  revalidatePath(`/roster/${workerId}`)
  return { ok: true }
}
