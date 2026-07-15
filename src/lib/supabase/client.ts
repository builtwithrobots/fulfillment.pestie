'use client'

import { useSession } from '@clerk/nextjs'
import { createClient } from '@supabase/supabase-js'
import { useMemo } from 'react'

import type { Database } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Browser-side Supabase client for Client Components (Realtime subscriptions,
 * optimistic reads). The client asks Clerk for a fresh session token on every
 * request so RLS applies with the signed-in user's identity.
 *
 * Usage:
 *   const supabase = useSupabaseBrowserClient()
 *   useEffect(() => {
 *     const channel = supabase
 *       .channel('line-status')
 *       .on('postgres_changes', { event: '*', schema: 'public', table: 'line_status' }, handler)
 *       .subscribe()
 *     return () => { supabase.removeChannel(channel) }
 *   }, [supabase])
 */
export function useSupabaseBrowserClient() {
  const { session } = useSession()

  return useMemo(
    () =>
      createClient<Database>(supabaseUrl, supabaseAnonKey, {
        accessToken: async () => (await session?.getToken()) ?? null,
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    [session]
  )
}
