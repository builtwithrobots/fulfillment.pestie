import { ApplicationLayout } from './application-layout'

// The dashboard is authenticated and renders per-user (Clerk session + live
// Supabase data), so it must never be statically prerendered at build time.
// force-dynamic keeps these routes out of the build-time export, where
// ClerkProvider has no request context (and, without env vars, no key).
export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <ApplicationLayout>{children}</ApplicationLayout>
}
