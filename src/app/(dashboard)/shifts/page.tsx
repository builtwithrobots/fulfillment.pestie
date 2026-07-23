import { listShiftPlans } from '@/lib/shifts/data'
import { ShiftPlanner } from './shift-planner'

export const metadata = { title: 'Shift planning' }

// Server-local "today" for the shift-date default (module scope keeps impure
// Date construction out of component render, matching the nowMs pattern).
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// TODO(role-access): gate this page to supervisor+ (getCurrentAppUser +
// hasRank from src/lib/users) and redirect others to '/' once role wiring is
// turned on.
export default async function ShiftsPage() {
  const history = await listShiftPlans()
  return <ShiftPlanner defaultDate={todayIso()} history={history} />
}
