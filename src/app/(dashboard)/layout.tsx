import { headers } from 'next/headers'

import { ApplicationLayout } from './application-layout'

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

  return <ApplicationLayout installOrigin={origin}>{children}</ApplicationLayout>
}
