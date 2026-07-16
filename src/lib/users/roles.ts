/**
 * Pure role helpers -- no DB, no React, no `server-only`. Safe to import from
 * server actions, Server Components, and Client Components alike.
 */
import type { AppRole } from '@/lib/supabase/types'

// Higher rank = more authority. Enforcement compares ranks (see hasRank).
export const ROLE_RANK: Record<AppRole, number> = {
  executive: 0,
  floor_lead: 1,
  supervisor: 2,
  director: 3,
}

export const ROLE_LABELS: Record<AppRole, string> = {
  director: 'Director',
  supervisor: 'Supervisor',
  floor_lead: 'Floor Lead',
  executive: 'Executive',
}

// Ordered high -> low for pickers.
export const ALL_ROLES: AppRole[] = ['director', 'supervisor', 'floor_lead', 'executive']

/** Does `role` meet or exceed the `min` required role? */
export function hasRank(role: AppRole, min: AppRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min]
}
