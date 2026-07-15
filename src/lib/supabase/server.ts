import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

import type { Database } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Supabase client for Server Components, Route Handlers, and Server Actions.
 *
 * Auth is owned by Clerk. We register Clerk as a third-party auth provider in
 * Supabase, so Postgres RLS reads the Clerk user id from `auth.jwt()->>'sub'`.
 * The `accessToken` callback hands Clerk's session token to Supabase on every
 * request — there are no JWT templates and no Supabase-managed session cookies.
 */
export async function createServerSupabaseClient() {
  const { getToken } = await auth()

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => (await getToken()) ?? null,
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Supabase client bound to the service role key — bypasses RLS.
 * Use ONLY in trusted server code (e.g. station-display token validation,
 * cron/webhook handlers). Never import this into a Client Component.
 */
export function createServiceRoleClient() {
  return createClient<Database>(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
