'use client'

import { useState, useTransition } from 'react'

import { Badge } from '@/components/badge'
import { Select } from '@/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import type { AppUserRow } from '@/lib/users/data'
import { setUserRole } from '@/lib/users/actions'
import { ALL_ROLES, ROLE_LABELS } from '@/lib/users/roles'
import type { AppRole } from '@/lib/supabase/types'

export function TeamAdmin({ users, currentUserId }: { users: AppUserRow[]; currentUserId: string }) {
  const [rows, setRows] = useState<AppUserRow[]>(users)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function changeRole(clerkUserId: string, role: AppRole) {
    setError(null)
    const prev = rows
    setRows((rs) => rs.map((r) => (r.clerkUserId === clerkUserId ? { ...r, role } : r)))
    startTransition(async () => {
      const res = await setUserRole(clerkUserId, role)
      if (!res.ok) {
        setRows(prev) // revert on failure
        setError(res.error)
      }
    })
  }

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No team members yet.</p>
  }

  return (
    <div>
      <Table dense className="[--gutter:--spacing(4)]">
        <TableHead>
          <TableRow>
            <TableHeader>Name</TableHeader>
            <TableHeader>Role</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((u) => (
            <TableRow key={u.clerkUserId}>
              <TableCell>
                <span className="font-medium text-zinc-950 dark:text-white">{u.name}</span>
                {u.clerkUserId === currentUserId && (
                  <Badge color="zinc" className="ml-2">
                    You
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <Select
                  aria-label={`Role for ${u.name}`}
                  value={u.role}
                  onChange={(e) => changeRole(u.clerkUserId, e.target.value as AppRole)}
                  className="max-w-48"
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
