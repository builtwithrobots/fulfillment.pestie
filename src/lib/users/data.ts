import 'server-only'

import { auth, currentUser } from '@clerk/nextjs/server'

import { AUTH_ENABLED } from '@/lib/auth-config'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { AppRole } from '@/lib/supabase/types'
import { hasRank, ROLE_LABELS } from './roles'

/**
 * Current-user identity + role, and role-gating helpers.
 *
 * app_users rows are provisioned lazily here (service-role, bypasses RLS): the
 * first authenticated user to arrive becomes a `director` so the team is never
 * lockable out of role administration; everyone after defaults to `floor_lead`.
 */

export type CurrentUser = {
  clerkUserId: string
  name: string
  role: AppRole
  authed: boolean
}

// Auth-off build-out: a director stub so the whole app (incl. admin UI) works
// without signing in. Nothing is written to the DB in this mode.
const DEV_USER: CurrentUser = { clerkUserId: 'dev-user', name: 'Test User', role: 'director', authed: false }

export async function getCurrentAppUser(): Promise<CurrentUser> {
  if (!AUTH_ENABLED) return DEV_USER

  const { userId } = await auth()
  if (!userId) return DEV_USER

  const supabase = createServiceRoleClient()
  const { data: existing } = await supabase
    .from('app_users')
    .select('full_name, role')
    .eq('clerk_user_id', userId)
    .maybeSingle()
  if (existing) return { clerkUserId: userId, name: existing.full_name, role: existing.role, authed: true }

  // Provision on first sight. Bootstrap the very first user as director.
  const cu = await currentUser()
  const name = cu?.fullName ?? cu?.primaryEmailAddress?.emailAddress ?? 'User'
  const { count } = await supabase.from('app_users').select('clerk_user_id', { count: 'exact', head: true })
  const role: AppRole = (count ?? 0) === 0 ? 'director' : 'floor_lead'

  const { data: inserted } = await supabase
    .from('app_users')
    .upsert({ clerk_user_id: userId, full_name: name, role }, { onConflict: 'clerk_user_id' })
    .select('full_name, role')
    .single()

  return {
    clerkUserId: userId,
    name: inserted?.full_name ?? name,
    role: inserted?.role ?? role,
    authed: true,
  }
}

/**
 * Returns null when the caller meets `min`, otherwise a user-facing error
 * string. Server actions call this and short-circuit on a non-null result.
 */
export async function assertRole(min: AppRole): Promise<string | null> {
  const me = await getCurrentAppUser()
  return hasRank(me.role, min) ? null : `You need ${ROLE_LABELS[min]} access or higher to do that.`
}

export type AppUserRow = {
  clerkUserId: string
  name: string
  role: AppRole
  createdAt: string
}

/** The whole team, for the Settings Team admin. Caller must be an admin. */
export async function listAppUsers(): Promise<AppUserRow[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('app_users')
    .select('clerk_user_id, full_name, role, created_at')
    .order('full_name', { ascending: true })
  if (error) throw error

  return (data ?? []).map((u) => ({
    clerkUserId: u.clerk_user_id,
    name: u.full_name,
    role: u.role,
    createdAt: u.created_at,
  }))
}
