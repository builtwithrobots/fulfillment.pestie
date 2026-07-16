import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * Public read for station displays. Displays authenticate with their signed
 * token (not Clerk), so this does NOT call requireUserId — callers must verify
 * the display token first. Returns the assigned worker names for a station,
 * alphabetical.
 */
export async function getStationAssignmentNames(stationId: string): Promise<string[]> {
  const supabase = createServiceRoleClient()

  const { data: rows, error } = await supabase
    .from('station_assignments')
    .select('worker_id')
    .eq('station_id', stationId)
  if (error) throw error

  const ids = (rows ?? []).map((r) => r.worker_id)
  if (ids.length === 0) return []

  const { data: workers, error: workersError } = await supabase.from('workers').select('full_name').in('id', ids)
  if (workersError) throw workersError

  return (workers ?? []).map((w) => w.full_name).sort((a, b) => a.localeCompare(b))
}
