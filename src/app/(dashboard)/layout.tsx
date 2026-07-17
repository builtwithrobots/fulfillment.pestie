import { cookies, headers } from 'next/headers'

import { getCurrentAppUser } from '@/lib/users/data'
import { ROLE_LABELS } from '@/lib/users/roles'
import { ApplicationLayout } from './application-layout'
import type { Theme } from './theme-toggle'

// The dashboard is authenticated and renders per-user (Clerk session + live
// Supabase data), so it must never be statically prerendered at build time.
// force-dynamic keeps these routes out of the build-time export, where
// ClerkProvider has no request context (and, without env vars, no key).
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Resolve this deployment's origin from the request so the install QR always
  // points at the URL the app is actually served from (preview or production).
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const origin = host ? `${proto}://${host}` : ''

  const me = await getCurrentAppUser()

  // Theme is a device preference stored in a cookie (default light). Passed in
  // so the switcher highlights the right option without a hydration mismatch.
  const themeCookie = (await cookies()).get('theme')?.value
  const initialTheme: Theme =
    themeCookie === 'dark' || themeCookie === 'system' || themeCookie === 'light' ? themeCookie : 'light'

  return (
    <ApplicationLayout
      installOrigin={origin}
      userName={me.name}
      userRole={ROLE_LABELS[me.role]}
      initialTheme={initialTheme}
    >
      {children}
    </ApplicationLayout>
  )
}
