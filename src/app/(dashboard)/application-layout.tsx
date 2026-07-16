'use client'

import { UserButton, useUser } from '@clerk/nextjs'
import { BugOff, ChartColumn, ClipboardList, LayoutGrid, ListChecks, Timer, Tv, Users } from 'lucide-react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { usePathname } from 'next/navigation'

import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Navbar, NavbarSection, NavbarSpacer } from '@/components/navbar'
import {
  Sidebar,
  SidebarBody,
  SidebarDivider,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@/components/sidebar'
import { SidebarLayout } from '@/components/sidebar-layout'
import { AUTH_ENABLED } from '@/lib/auth-config'
import { InstallQR } from './install-qr'

// `soon` marks features that aren't live yet -- they get a "Soon" badge in the
// sidebar. Time studies is the shipped feature, so it carries no badge.
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
const nav = [
  { href: '/', label: 'Overview', icon: ChartColumn, soon: true },
  { href: '/studies', label: 'Time studies', icon: Timer, soon: false },
  { href: '/shifts', label: 'Shift Planning', icon: ClipboardList, soon: true },
  { href: '/labor', label: 'Labor Allocation', icon: Users, soon: true },
  { href: '/floor', label: 'Floor Layout', icon: LayoutGrid, soon: false },
  { href: '/lines', label: 'Lines & Stations', icon: ListChecks, soon: true },
  { href: '/displays', label: 'Displays', icon: Tv, soon: true },
]

export function ApplicationLayout({
  children,
  installOrigin,
}: {
  children: React.ReactNode
  installOrigin: string
}) {
  const pathname = usePathname()
  const { user } = useUser()

  // Real Clerk identity once auth is enabled; a stub while auth is off so the
  // account chip is visible during build-out. Role is a placeholder until
  // app_users.role is wired through.
  const displayName =
    AUTH_ENABLED && user ? (user.fullName ?? user.primaryEmailAddress?.emailAddress ?? 'User') : 'Test User'
  const displayRole = 'Test Role'

  return (
    // reducedMotion="user" makes every Motion animation below (including
    // Catalyst's own sidebar transitions) honor the OS prefers-reduced-motion.
    <MotionConfig reducedMotion="user">
    <SidebarLayout
      navbar={
        <Navbar>
          <NavbarSpacer />
          <NavbarSection>{AUTH_ENABLED ? <UserButton /> : null}</NavbarSection>
        </Navbar>
      }
      sidebar={
        <Sidebar>
          <SidebarHeader>
            {/* Pestie brand lockup: bug-off badge + wordmark vertically centered,
                "Fulfillment" as a gray badge in the upper-right of the section. */}
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#16a34a] text-white shadow-sm">
                <BugOff className="size-7" strokeWidth={2} />
              </div>
              <div className="text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">Pestie</div>
              <Badge color="zinc" className="ml-auto self-start">
                Fulfillment
              </Badge>
            </div>
          </SidebarHeader>
          <SidebarBody>
            <SidebarSection>
              {nav.map(({ href, label, icon: Icon, soon }) => (
                <SidebarItem
                  key={href}
                  href={href}
                  current={href === '/' ? pathname === '/' : pathname.startsWith(href)}
                >
                  <Icon data-slot="icon" />
                  <SidebarLabel>{label}</SidebarLabel>
                  {soon && (
                    <Badge color="zinc" className="ml-auto shrink-0">
                      Soon
                    </Badge>
                  )}
                </SidebarItem>
              ))}
            </SidebarSection>
            <SidebarSpacer />
            <SidebarSection>
              <SidebarItem href="/settings">
                <SidebarLabel>Settings</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
          </SidebarBody>
          <SidebarFooter>
            {/* Scan-to-install QR for the phone PWA */}
            <InstallQR origin={installOrigin} />
            <SidebarDivider />
            {/* Account chip: role above name (real Clerk name once auth is on) */}
            <div className="flex items-center gap-3 px-2 py-1">
              <Avatar
                initials={initialsOf(displayName)}
                className="size-9 bg-zinc-200 text-zinc-700 dark:bg-white/10 dark:text-white"
              />
              <div className="min-w-0">
                <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{displayRole}</div>
                <div className="truncate text-sm font-medium text-zinc-950 dark:text-white">{displayName}</div>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>
      }
    >
      {/* Auth-disabled indicator: a small, non-disruptive yellow label pinned to
          the upper-right on every view (fixed, so it never pushes content). */}
      {!AUTH_ENABLED && (
        <div className="pointer-events-none fixed top-2 right-2 z-40 sm:top-3 sm:right-3">
          <span
            title="Auth is disabled -- anyone can access this app. Set NEXT_PUBLIC_ENABLE_AUTH=true to require sign-in before production use."
            className="pointer-events-auto rounded-full bg-yellow-300 px-2.5 py-1 text-xs font-medium text-yellow-950 shadow-sm ring-1 ring-yellow-500/40 dark:bg-yellow-400/20 dark:text-yellow-200 dark:ring-yellow-400/30"
          >
            ⚠ Auth disabled
          </span>
        </div>
      )}
      {/* Fade content between routes; keyed by pathname. The floor editor runs
          full width; every other page keeps a comfortable reading cap. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className={pathname.startsWith('/floor') ? 'mx-auto w-full' : 'mx-auto w-full max-w-[85rem]'}>
            {children}
          </div>
        </motion.div>
      </AnimatePresence>
    </SidebarLayout>
    </MotionConfig>
  )
}
