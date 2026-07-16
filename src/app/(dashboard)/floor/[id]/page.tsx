import { notFound } from 'next/navigation'

import { getPlan, getShapes, listStationOptions } from '@/lib/floor/data'
import { FloorEditor } from './floor-editor'

export const metadata = { title: 'Floor layout' }

export default async function FloorPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const plan = await getPlan(id)
  if (!plan) notFound()

  const [shapes, stations] = await Promise.all([getShapes(id), listStationOptions()])

  return <FloorEditor plan={plan} initialShapes={shapes} stations={stations} />
}
