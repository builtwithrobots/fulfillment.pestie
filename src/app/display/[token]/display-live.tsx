'use client'

import { useEffect, useState } from 'react'

/**
 * Station display body. Renders the station name + currently-assigned worker
 * names, polling the token-scoped assignments endpoint every few seconds so the
 * screen stays current as supervisors reshuffle staffing. Displays are public
 * (no Clerk session), so polling replaces the RLS-gated Realtime channel.
 */
export function DisplayLive({
  token,
  initialName,
  initialWorkers,
}: {
  token: string
  initialName: string
  initialWorkers: string[]
}) {
  const [name, setName] = useState(initialName)
  const [workers, setWorkers] = useState<string[]>(initialWorkers)

  useEffect(() => {
    let active = true
    async function poll() {
      try {
        const res = await fetch(`/display/${token}/assignments`, { cache: 'no-store' })
        if (!res.ok || !active) return
        const data = (await res.json()) as { name?: string; workers?: string[] }
        if (!active) return
        if (typeof data.name === 'string') setName(data.name)
        if (Array.isArray(data.workers)) setWorkers(data.workers)
      } catch {
        // Keep last-known values on transient network errors.
      }
    }
    const id = setInterval(poll, 5000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [token])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-10 bg-zinc-950 px-8 py-12 text-white">
      <h1 className="text-center text-7xl font-semibold tracking-tight">{name}</h1>

      {workers.length > 0 ? (
        <ul className="flex max-w-6xl flex-wrap justify-center gap-4">
          {workers.map((w) => (
            <li key={w} className="rounded-2xl bg-white/10 px-7 py-4 text-4xl font-medium ring-1 ring-white/10">
              {w}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-4xl text-zinc-500">Unassigned</p>
      )}

      <p className="mt-2 text-lg text-zinc-600">
        {workers.length} assigned · updates live
      </p>
    </main>
  )
}
