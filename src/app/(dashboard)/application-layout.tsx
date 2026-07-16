'use client'

import { UserButton } from '@clerk/nextjs'
import { ChartColumn, ClipboardList, ListChecks, Timer, Tv, Users } from 'lucide-react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { usePathname } from 'next/navigation'

import { Badge } from '@/components/badge'
import { Navbar, NavbarSection, NavbarSpacer } from '@/components/navbar'
import {
  Sidebar,
  SidebarBody,
  SidebarHeader,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@/components/sidebar'
import { SidebarLayout } from '@/components/sidebar-layout'
import { AUTH_ENABLED } from '@/lib/auth-config'

// `soon` marks features that aren't live yet — they get a "Soon" badge in the
// sidebar. Time studies is the shipped feature, so it carries no badge.
const nav = [
  { href: '/', label: 'Overview', icon: ChartColumn, soon: true },
  { href: '/studies', label: 'Time studies', icon: Timer, soon: false },
  { href: '/shifts', label: 'Shift Planning', icon: ClipboardList, soon: true },
  { href: '/labor', label: 'Labor Allocation', icon: Users, soon: true },
  { href: '/lines', label: 'Lines & Stations', icon: ListChecks, soon: true },
  { href: '/displays', label: 'Displays', icon: Tv, soon: true },
]

export function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    // reducedMotion="user" makes every Motion animation below (including
    // Catalyst's own sidebar transitions) honor the OS prefers-reduced-motion.
    <MotionConfig reducedMotion="user">
    <SidebarLayout
      navbar={
        <Navbar>
          <NavbarSpacer />
          <NavbarSection>
            {AUTH_ENABLED ? <UserButton /> : <span className="text-xs text-zinc-400">dev · no auth</span>}
          </NavbarSection>
        </Navbar>
      }
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <SidebarHeading>Pestie Fulfillment</SidebarHeading>
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
        </Sidebar>
      }
    >
      {!AUTH_ENABLED && (
        <div className="mb-6 rounded-md bg-amber-100 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20">
          ⚠ Auth is disabled — anyone can access this app. Set{' '}
          <code className="font-mono">NEXT_PUBLIC_ENABLE_AUTH=true</code> to require sign-in before production use.
        </div>
      )}
      {/* Fade content between routes; keyed by pathname. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </SidebarLayout>
    </MotionConfig>
  )
}
