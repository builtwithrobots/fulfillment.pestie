'use server'

import { revalidatePath } from 'next/cache'

import { createServiceRoleClient } from '@/lib/supabase/server'
import type { AppRole } from '@/lib/supabase/types'
import { assertRole } from './data'
import { ALL_ROLES } from './roles'

export type ActionResult = { ok: true } | { ok: false; error: string }

/** Change a user's role. Admins only (director/supervisor). */
export async function setUserRole(clerkUserId: string, role: AppRole): Promise<ActionResult> {
  const err = await assertRole('supervisor')
  if (err) return { ok: false, error: err }
  if (!ALL_ROLES.includes(role)) return { ok: false, error: 'Invalid role.' }

  const supabase = createServiceRoleClient()

  // Guard against removing the last director (which would lock role admin).
  const { data: target } = await supabase
    .from('app_users')
    .select('role')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle()
  if (target?.role === 'director' && role !== 'director') {
    const { count } = await supabase
      .from('app_users')
      .select('clerk_user_id', { count: 'exact', head: true })
      .eq('role', 'director')
    if ((count ?? 0) <= 1) return { ok: false, error: 'There must be at least one director.' }
  }

  const { error } = await supabase.from('app_users').update({ role }).eq('clerk_user_id', clerkUserId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings')
  return { ok: true }
}
